/**
 * iot-stream.routes.ts — endpoint SSE para leituras e eventos em tempo real
 *
 * SSE (Server-Sent Events) é uma tecnologia HTTP padrão onde o servidor mantém
 * uma conexão aberta e envia eventos unidirecionais ao cliente quando há dados
 * novos. É mais simples que WebSockets para casos de uso unidirecionais como
 * este — o front-end só precisa receber dados, nunca enviar de volta.
 *
 * Formato SSE: o protocolo exige que cada mensagem seja prefixada com "data: "
 * e terminada com dois newlines (\n\n). O front-end recebe isso via
 * EventSource (API nativa do browser) ou via biblioteca equivalente em mobile.
 *
 * Segurança: o endpoint exige autenticação. As leituras são filtradas por
 * userId — cada cliente só recebe dados dos seus próprios medidores.
 *
 * Contrato de eventos:
 *   connected     { meterCount }
 *   reading       { meterId, voltage, current, powerW, powerFactor, receivedAt }
 *   alert-firing  { type: "start"|"end", alertId, alertName, meterId, startedAt, endedAt? }
 *   notification  { ...Notification }
 */
import { Router, type Request, type RequestHandler, type Response } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import type {
    IoTDataProcessor,
    MeterReadingSample,
} from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { UserEventHub } from "@/shared/sse/user-event-hub.js"
import { AuthRepository } from "@/modules/auth/auth.repository.js"
import { hashToken } from "@/shared/crypto/hashToken.js"
import { SseTicketService } from "@/modules/iot/sse-ticket.service.js"

// Re-resolução periódica do conjunto de medidores do usuário dentro da
// mesma conexão — corrige o snapshot inicial: um medidor criado (ou
// removido) depois de abrir a conexão passa a (deixar de) transmitir sem
// que o cliente precise reconectar.
const DEFAULT_MEMBERSHIP_REFRESH_INTERVAL_MS = 60_000

/**
 * Resolve o conjunto de meterIds que pertencem a um usuário, unindo os 3
 * caminhos de posse (medidor vinculado a property, area ou device do
 * usuário).
 */
async function resolveUserMeterIds(userId: string, prisma: PrismaClient): Promise<Set<string>> {
    const meters = await prisma.meter.findMany({
        where: {
            OR: [
                { property: { userId } },
                { area: { property: { userId } } },
                { device: { area: { property: { userId } } } },
            ],
        },
        select: { id: true },
    })

    return new Set(meters.map((m) => m.id))
}

// SSE nunca passa pelo middleware `authenticate` de novo depois do
// handshake inicial (a conexão fica aberta indefinidamente). Sem esta
// checagem periódica, um stream aberto antes de um logout ou reset de
// senha continuaria entregando leituras/eventos indefinidamente, mesmo com
// a sessão já revogada. Mesma checagem que `authenticate` faz por
// requisição (revokedAt/expiresAt), aplicada aqui a cada refresh periódico
// em vez de a cada mensagem — SSE não tem "requisição" recorrente para
// prender a checagem nela.
async function isSessionStillValid(
    authToken: string,
    authRepository: AuthRepository,
): Promise<boolean> {
    const stored = await authRepository.findActiveToken(hashToken(authToken))
    if (!stored) return false
    if (stored.revokedAt !== null) return false
    if (stored.expiresAt !== null && stored.expiresAt < new Date()) return false
    return true
}

// Autentica GET /stream por `?ticket=` (cross-origin, demo do Render) OU
// cai no `authenticate` normal (cookie/header, mesma origem) quando não há
// ticket na query — extraído da função de setup das rotas só para não
// estourar o limite de linhas por função do lint.
function createStreamAuthMiddleware(
    authenticate: RequestHandler,
    ticketService: SseTicketService,
): RequestHandler {
    return (req, res, next) => {
        const ticketParam = req.query.ticket

        if (typeof ticketParam !== "string") {
            authenticate(req, res, next)
            return
        }

        const resolved = ticketService.consume(ticketParam)
        if (!resolved) {
            res.status(401).json({ status: "error", message: "Ticket inválido ou expirado" })
            return
        }

        const authenticatedReq = req as AuthenticatedRequest
        authenticatedReq.user = {
            id: resolved.userId,
            email: resolved.email,
            userType: resolved.userType,
            role: resolved.role,
            isDemo: resolved.isDemo,
        }
        authenticatedReq.authToken = resolved.authToken
        authenticatedReq.authSource = "header" // bearer-like: token explícito, não cookie do browser
        next()
    }
}

// ─── Backpressure de escrita SSE ───────────────────────────────────────────
//
// Extraído do corpo da conexão para ser testável sem um socket real — mesmo
// motivo de extração já usado nos adaptadores de protocolo IoT
// (_handleMessage, _readSample): reproduzir res.write() devolvendo false
// (buffer de saída cheio) e o evento 'drain' subsequente de verdade exigiria
// um consumidor lento de fato, over TCP real.
export interface SseWritable {
    write(chunk: string): boolean
    once(event: "drain", listener: () => void): void
}

export interface SseBackpressureState {
    awaitingDrain: boolean
    disconnected: boolean
}

export function createBackpressureState(): SseBackpressureState {
    return { awaitingDrain: false, disconnected: false }
}

/**
 * Escreve um chunk SSE já formatado, tratando backpressure.
 *
 * Se o buffer de saída já estava cheio desde a escrita anterior (o 'drain'
 * daquela escrita ainda não disparou) e chega uma NOVA mensagem, o
 * consumidor do outro lado é persistentemente lento — não dá pra saber
 * quando (se algum dia) ele vai drenar. Em vez de empilhar mais dados no
 * buffer indefinidamente (memória cresce sem limite), aciona `onSlowConsumer`
 * para a conexão ser encerrada.
 *
 * @param res - Destino da escrita (Response real ou fake de teste).
 * @param state - Estado de backpressure desta conexão, de `createBackpressureState()`.
 * @param chunk - Frame SSE já formatado (`event: ...\ndata: ...\n\n` ou comentário `: ...\n\n`).
 * @param onSlowConsumer - Chamado no lugar da escrita quando o consumidor é considerado lento.
 */
export function writeSseChunk(
    res: SseWritable,
    state: SseBackpressureState,
    chunk: string,
    onSlowConsumer: () => void,
): void {
    if (state.disconnected) return

    if (state.awaitingDrain) {
        state.disconnected = true
        onSlowConsumer()
        return
    }

    const ok = res.write(chunk)
    if (!ok) {
        state.awaitingDrain = true
        res.once("drain", () => {
            state.awaitingDrain = false
        })
    }
}

// Par writeEvent/writeRaw de uma conexão — extraído do corpo de
// createStreamHandler só para não estourar o limite de linhas por função do
// lint (mesmo motivo dos demais extraídos neste arquivo).
function createEventWriter(
    res: Response,
    cleanup: () => void,
): {
    writeEvent: (eventName: string, payload: string) => void
    writeRaw: (chunk: string) => void
} {
    const backpressure = createBackpressureState()

    // Consumidor persistentemente lento (buffer de saída cheio, sem drenar
    // entre uma escrita e a próxima) — encerra em vez de deixar o buffer
    // crescer sem limite.
    function disconnectSlowConsumer(): void {
        cleanup()
        if (!res.writableEnded) res.end()
    }

    return {
        writeEvent: (eventName, payload) =>
            writeSseChunk(
                res,
                backpressure,
                `event: ${eventName}\ndata: ${payload}\n\n`,
                disconnectSlowConsumer,
            ),
        writeRaw: (chunk) => writeSseChunk(res, backpressure, chunk, disconnectSlowConsumer),
    }
}

// Revalida a sessão e re-resolve o conjunto de medidores do usuário a cada
// tick, sem exigir reconexão do cliente — extraído do corpo de
// createStreamHandler pelo mesmo motivo do writer acima. Sessão revogada
// (logout, reset de senha) ou expirada encerra a resposta.
function startMembershipRefresh(options: {
    res: Response
    userId: string
    authToken: string
    prismaClient: PrismaClient
    authRepository: AuthRepository
    intervalMs: number
    onMeterIdsRefreshed: (ids: Set<string>) => void
    cleanup: () => void
}): NodeJS.Timeout {
    const { res, userId, authToken, prismaClient, authRepository, intervalMs } = options

    return setInterval(() => {
        void (async () => {
            // A conexão pode já ter fechado (cleanup() já rodou) enquanto
            // este tick estava em voo — um tick já disparado não é cancelado
            // por clearInterval. Sem essa guarda, um erro aqui (ex.: pool de
            // conexões já encerrado) vira uma promise rejeitada sem
            // tratamento, que no Node derruba o processo inteiro — levando
            // junto todo stream SSE aberto, não só este.
            if (res.writableEnded) return
            try {
                const sessionValid = await isSessionStillValid(authToken, authRepository)
                if (res.writableEnded) return
                if (!sessionValid) {
                    options.cleanup()
                    res.end()
                    return
                }
                options.onMeterIdsRefreshed(await resolveUserMeterIds(userId, prismaClient))
            } catch {
                // Falha transitória (rede, banco) durante a revalidação
                // periódica — a conexão segue aberta e tenta de novo no
                // próximo tick; não deve derrubar o processo nem o stream.
            }
        })()
    }, intervalMs)
}

// Corpo da conexão SSE em si (uma vez já autenticada por qualquer um dos
// dois caminhos acima) — extraído pelo mesmo motivo do middleware acima.
function createStreamHandler(
    prismaClient: PrismaClient,
    processor: IoTDataProcessor,
    userEventHub: UserEventHub,
    authRepository: AuthRepository,
    membershipRefreshIntervalMs: number,
) {
    // Compartilhado entre TODAS as conexões deste router (não por conexão) —
    // uma amostra processada é o mesmo objeto para todo listener que a
    // recebe (IoTDataProcessor.process() itera um Set de listeners com a
    // mesma referência, ver processo lá). Múltiplas conexões do mesmo
    // usuário (abas/dispositivos diferentes) hoje serializavam a mesma
    // amostra uma vez por conexão; a WeakMap garante uma serialização por
    // amostra, e o próprio GC libera a entrada quando a amostra deixa de ser
    // referenciada por qualquer listener.
    const serializedSampleCache = new WeakMap<MeterReadingSample, string>()

    return async (req: Request, res: Response): Promise<void> => {
        const { id: userId } = (req as AuthenticatedRequest).user
        const { authToken } = req as AuthenticatedRequest

        // Configura os headers SSE obrigatórios.
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.flushHeaders()

        let userMeterIds = await resolveUserMeterIds(userId, prismaClient)

        const { writeEvent, writeRaw } = createEventWriter(res, () => cleanup())

        writeEvent("connected", JSON.stringify({ meterCount: userMeterIds.size }))

        // ─── Listener de leituras IoT ─────────────────────────────────────────
        const readingUnsub = processor.addSampleListener((sample) => {
            if (!userMeterIds.has(sample.meterId)) return

            let payload = serializedSampleCache.get(sample)
            if (payload === undefined) {
                payload = JSON.stringify(sample)
                serializedSampleCache.set(sample, payload)
            }

            writeEvent("reading", payload)
        })

        // ─── Listener de eventos por usuário (alert-firing, notification) ────
        // O UserEventHub já filtra por userId — só chama este listener quando
        // o evento é do próprio usuário. O nome do evento SSE é o mesmo nome
        // passado para userEventHub.emit(...).
        const eventUnsub = userEventHub.addListener(userId, (event, payload) => {
            writeEvent(event, JSON.stringify(payload))
        })

        function cleanup(): void {
            readingUnsub()
            eventUnsub()
            clearInterval(membershipRefresh)
            clearInterval(keepAlive)
        }

        // Re-resolve o conjunto de medidores E revalida a sessão
        // periodicamente, sem exigir reconexão do cliente.
        const membershipRefresh = startMembershipRefresh({
            res,
            userId,
            authToken,
            prismaClient,
            authRepository,
            intervalMs: membershipRefreshIntervalMs,
            onMeterIdsRefreshed: (ids) => {
                userMeterIds = ids
            },
            cleanup: () => cleanup(),
        })

        // Keep-alive: envia um comentário SSE a cada 30 segundos.
        const keepAlive = setInterval(() => {
            writeRaw(": keep-alive\n\n")
        }, 30_000)

        // Cleanup ao desconectar.
        req.on("close", cleanup)
    }
}

export function iotStreamRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    processor: IoTDataProcessor,
    userEventHub: UserEventHub,
    membershipRefreshIntervalMs: number = DEFAULT_MEMBERSHIP_REFRESH_INTERVAL_MS,
): Router {
    const router = Router()
    const authRepository = new AuthRepository(prismaClient)
    const ticketService = new SseTicketService()

    /**
     * POST /api/iot/stream-ticket
     * Emite um ticket de uso único e vida curta (30s) para autenticar o
     * GET /stream quando ele precisa ser aberto cross-origin — cookie de
     * sessão não atravessa domínio (ver comentário em sse-ticket.service.ts).
     * Autenticado normalmente (cookie/CSRF, mesma origem via rewrite).
     */
    router.post("/stream-ticket", authenticate, (req, res) => {
        const { id, email, userType, role, isDemo } = (req as AuthenticatedRequest).user
        const { authToken } = req as AuthenticatedRequest

        const ticket = ticketService.issue({
            userId: id,
            email,
            userType,
            role,
            isDemo,
            authToken,
        })
        res.status(201).json({ status: "success", data: { ticket } })
    })

    /**
     * GET /api/iot/stream
     * Abre uma conexão SSE e começa a receber leituras e eventos por usuário
     * em tempo real.
     *
     * Autenticação: cookie/header normal (mesma origem — dev, self-hosted)
     * OU um `?ticket=` de uso único emitido por POST /stream-ticket acima
     * (demo do Render, cross-origin — `EventSource`/`fetch` não reaproveita
     * cookie de outro domínio, então este é o único jeito de autenticar essa
     * chamada específica sem enfraquecer nada mais na aplicação).
     *
     * O cliente deve tratar a desconexão e reconectar se necessário.
     * Intervalo de keep-alive: um comentário ":" é enviado a cada 30 segundos
     * para evitar que proxies ou firewalls fechem conexões ociosas.
     */
    router.get(
        "/stream",
        createStreamAuthMiddleware(authenticate, ticketService),
        createStreamHandler(
            prismaClient,
            processor,
            userEventHub,
            authRepository,
            membershipRefreshIntervalMs,
        ),
    )

    return router
}
