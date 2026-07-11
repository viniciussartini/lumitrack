/**
 * iot-stream.routes.ts — endpoint SSE para leituras IoT em tempo real
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
 * O conjunto de medidores do usuário é resolvido no momento da conexão
 * (snapshot) — um medidor criado depois exige reconectar. A re-resolução
 * periódica desse conjunto fica para a Fase 4, junto com o contrato SSE
 * completo (alert-firing/notification).
 *
 * Reformulação IoT (Fase 2): o evento "reading" deixou de carregar apenas um
 * incremento de kWh por device — agora carrega a leitura elétrica instantânea
 * (tensão/corrente/potência/fator de potência) por medidor.
 */
import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import type { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import { AlertNotifier } from "@/modules/alert/alert-notifier.js"

/**
 * Resolve o conjunto de meterIds que pertencem a um usuário, unindo os 3
 * caminhos de posse (medidor vinculado a property, area ou device do
 * usuário). Executado uma única vez no momento em que o cliente abre a
 * conexão SSE.
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
    alertNotifier: AlertNotifier,
): Router {
    const router = Router()

    /**
     * GET /api/iot/stream
     * Abre uma conexão SSE e começa a receber leituras em tempo real.
     *
     * Eventos emitidos:
     *   event: "connected"
     *   data: { "meterCount": 3 }  ← enviado imediatamente ao conectar
     *
     *   event: "reading"
     *   data: { "meterId": "...", "voltage": 127.3, "current": 4.2,
     *            "powerW": 532.1, "powerFactor": 0.98,
     *            "receivedAt": "2025-01-15T14:37:22.500Z" }
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

        const userMeterIds = await resolveUserMeterIds(userId, prismaClient)

        res.write(`event: connected\ndata: ${JSON.stringify({ meterCount: userMeterIds.size })}\n\n`)

        // ─── Listener de leituras IoT ─────────────────────────────────────────
        const readingUnsub = processor.addSampleListener((sample) => {
            if (!userMeterIds.has(sample.meterId)) return
            const payload = JSON.stringify(sample)
            res.write(`event: reading\ndata: ${payload}\n\n`)
        })

        // ─── Listener de alertas ──────────────────────────────────────────────
        // O AlertNotifier já filtra por userId — só chama este listener quando
        // um alerta do próprio usuário é disparado. Sem necessidade de filtro
        // aqui. O contrato de payload deste evento é redesenhado na Fase 4
        // (alert-firing), quando o módulo alert é reescrito.
        const alertUnsub = alertNotifier.addListener(userId, (alert) => {
            const payload = JSON.stringify(alert)
            res.write(`event: alert\ndata: ${payload}\n\n`)
        })

        // Keep-alive: envia um comentário SSE a cada 30 segundos.
        const keepAlive = setInterval(() => {
            res.write(": keep-alive\n\n")
        }, 30_000)

        // Cleanup ao desconectar.
        req.on("close", () => {
            readingUnsub()
            alertUnsub()
            clearInterval(keepAlive)
        })
    })

    return router
}
