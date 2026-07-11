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
import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import type { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { UserEventHub } from "@/shared/sse/user-event-hub.js"

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

export function iotStreamRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    processor: IoTDataProcessor,
    userEventHub: UserEventHub,
    membershipRefreshIntervalMs: number = DEFAULT_MEMBERSHIP_REFRESH_INTERVAL_MS,
): Router {
    const router = Router()

    /**
     * GET /api/iot/stream
     * Abre uma conexão SSE e começa a receber leituras e eventos por usuário
     * em tempo real.
     *
     * O cliente deve tratar a desconexão e reconectar se necessário.
     * Intervalo de keep-alive: um comentário ":" é enviado a cada 30 segundos
     * para evitar que proxies ou firewalls fechem conexões ociosas.
     */
    router.get("/stream", authenticate, async (req, res) => {
        const { id: userId } = (req as AuthenticatedRequest).user

        // Configura os headers SSE obrigatórios.
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.flushHeaders()

        let userMeterIds = await resolveUserMeterIds(userId, prismaClient)

        res.write(`event: connected\ndata: ${JSON.stringify({ meterCount: userMeterIds.size })}\n\n`)

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

        // Re-resolve o conjunto de medidores periodicamente, sem exigir
        // reconexão do cliente.
        const membershipRefresh = setInterval(() => {
            void resolveUserMeterIds(userId, prismaClient).then((ids) => {
                userMeterIds = ids
            })
        }, membershipRefreshIntervalMs)

        // Keep-alive: envia um comentário SSE a cada 30 segundos.
        const keepAlive = setInterval(() => {
            res.write(": keep-alive\n\n")
        }, 30_000)

        // Cleanup ao desconectar.
        req.on("close", () => {
            readingUnsub()
            eventUnsub()
            clearInterval(membershipRefresh)
            clearInterval(keepAlive)
        })
    })

    return router
}
