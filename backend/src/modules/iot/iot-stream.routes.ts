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
 * Contrato de eventos (Fase 4):
 *   connected     { meterCount }
 *   reading       { meterId, voltage, current, powerW, powerFactor, receivedAt }
 *   alert-firing  { type: "start"|"end", alertId, alertName, meterId, startedAt, endedAt? }
 *   notification  { ...Notification }
 */
import { Router, type Request, type RequestHandler, type Response } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import type { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
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

// Issue #184 — SSE nunca passa pelo middleware `authenticate` de novo depois
// do handshake inicial (a conexão fica aberta indefinidamente). Sem isso, um
// stream aberto antes de um logout ou reset de senha continuava entregando
// leituras/eventos indefinidamente, mesmo com a sessão já revogada. Mesma
// checagem que `authenticate` faz por requisição (revokedAt/expiresAt),
// aplicada aqui a cada refresh periódico em vez de a cada mensagem — SSE não
// tem "requisição" recorrente para prender a checagem nela.
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

// Corpo da conexão SSE em si (uma vez já autenticada por qualquer um dos
// dois caminhos acima) — extraído pelo mesmo motivo do middleware acima.
function createStreamHandler(
    prismaClient: PrismaClient,
    processor: IoTDataProcessor,
    userEventHub: UserEventHub,
    authRepository: AuthRepository,
    membershipRefreshIntervalMs: number,
) {
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

        res.write(
            `event: connected\ndata: ${JSON.stringify({ meterCount: userMeterIds.size })}\n\n`,
        )

        // ─── Listener de leituras IoT ─────────────────────────────────────────
        const readingUnsub = processor.addSampleListener((sample) => {
            if (!userMeterIds.has(sample.meterId)) return
            const payload = JSON.stringify(sample)
            res.write(`event: reading\ndata: ${payload}\n\n`)
        })

        // ─── Listener de eventos por usuário (alert-firing, notification) ────
        // O UserEventHub já filtra por userId — só chama este listener quando
        // o evento é do próprio usuário. O nome do evento SSE é o mesmo nome
        // passado para userEventHub.emit(...).
        const eventUnsub = userEventHub.addListener(userId, (event, payload) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
        })

        function cleanup(): void {
            readingUnsub()
            eventUnsub()
            clearInterval(membershipRefresh)
            clearInterval(keepAlive)
        }

        // Re-resolve o conjunto de medidores E revalida a sessão (issue #184)
        // periodicamente, sem exigir reconexão do cliente. Sessão revogada
        // (logout, reset de senha) ou expirada encerra a resposta — o
        // cliente (EventSource ou equivalente) simplesmente vê a conexão
        // terminar, coerente com a sessão não existir mais.
        const membershipRefresh = setInterval(() => {
            void (async () => {
                // A conexão pode já ter fechado (cleanup() já rodou, limpando
                // este interval) enquanto este tick estava em voo — um tick já
                // disparado não é cancelado por clearInterval. Sem essa guarda,
                // um erro aqui (ex.: pool de conexões já encerrado) vira uma
                // promise rejeitada sem tratamento, que no Node derruba o
                // processo inteiro — levando junto todo stream SSE aberto, não
                // só este.
                if (res.writableEnded) return
                try {
                    const sessionValid = await isSessionStillValid(authToken, authRepository)
                    if (res.writableEnded) return
                    if (!sessionValid) {
                        cleanup()
                        res.end()
                        return
                    }
                    userMeterIds = await resolveUserMeterIds(userId, prismaClient)
                } catch {
                    // Falha transitória (rede, banco) durante a revalidação
                    // periódica — a conexão segue aberta e tenta de novo no
                    // próximo tick; não deve derrubar o processo nem o stream.
                }
            })()
        }, membershipRefreshIntervalMs)

        // Keep-alive: envia um comentário SSE a cada 30 segundos.
        const keepAlive = setInterval(() => {
            res.write(": keep-alive\n\n")
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
