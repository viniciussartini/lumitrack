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
 * userId — cada cliente só recebe dados dos seus próprios devices.
 * O mapa de devices do usuário é resolvido no momento da conexão e
 * atualizado automaticamente? Não — para simplicidade, usamos o snapshot
 * no momento da conexão. Se o usuário adicionar um device, precisará
 * reconectar. Isso é aceitável para a maioria dos casos de uso.
 */
import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import type { IoTDataProcessor } from "@/modules/iot/iot-worker/IoTDataProcessor.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import { AlertNotifier } from "@/modules/alert/alert-notifier.js"

/**
 * Resolve o conjunto de deviceIds que pertencem a um usuário.
 * Percorre a hierarquia: user → properties → areas → devices.
 * Essa query é executada uma única vez no momento em que o cliente abre a conexão SSE.
 * 
 * @param userId 
 * @param prisma 
 * @returns 
 */
async function resolveUserDeviceIds(userId: string, prisma: PrismaClient): Promise<Set<string>> {
    const devices = await prisma.device.findMany({
        where: {
            area: {
                property: {
                    userId,
                },
            },
        },
        select: { id: true },
    })

    return new Set(devices.map((d) => d.id))
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
     *   event: "reading"
     *   data: { "deviceId": "...", "kwhConsumed": 0.003, "receivedAt": "2025-01-15T14:37:22.500Z" }
     *   data: { "deviceCount": 3 }  ← enviado imediatamente ao conectar
     * 
     * O cliente deve tratar a desconexão e reconectar se necessário.
     * Intervalo de keep-alive: um comentário ":" é enviado a cada 30 segundos
     * para evitar que proxies ou firewalls fechem conexões ociosas.
     */
    router.get("/stream", authenticate, async (req, res) => {
        const { id: userId } = (req as AuthenticatedRequest).user

        // Configura os headers SSE obrigatórios.
        // Cache-Control: no-cache impede que proxies armazenem o stream.
        // Connection: keep-alive garante que a conexão permaneça aberta.
        // X-Accel-Buffering: no desativa o buffering do Nginx, que sem isso
        // acumularia os eventos antes de enviar ao cliente.
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.flushHeaders()

        // Resolve os devices do usuário para filtrar as leituras.
        const userDeviceIds = await resolveUserDeviceIds(userId, prismaClient)

        // Evento inicial de confirmação de conexão.
        res.write(`event: connected\ndata: ${JSON.stringify({ deviceCount: userDeviceIds.size })}\n\n`)

        // ─── Listener de leituras IoT ─────────────────────────────────────────
        // Filtra por userId: só transmite leituras dos devices do usuário.
        const readingUnsub = processor.addSseListener((deviceId, kwhConsumed, receivedAt) => {
            if (!userDeviceIds.has(deviceId)) return
            const payload = JSON.stringify({ deviceId, kwhConsumed, receivedAt })
            res.write(`event: reading\ndata: ${payload}\n\n`)
        })
 
        // ─── Listener de alertas ──────────────────────────────────────────────
        // O AlertNotifier já filtra por userId — só chama este listener quando
        // um alerta do próprio usuário é disparado. Sem necessidade de filtro aqui.
        const alertUnsub = alertNotifier.addListener(userId, (alert) => {
            const payload = JSON.stringify(alert)
            res.write(`event: alert\ndata: ${payload}\n\n`)
        })

        // Keep-alive: envia um comentário SSE a cada 30 segundos.
        // Comentários SSE começam com ":" e são ignorados pelo EventSource do browser,
        // mas mantêm a conexão TCP ativa através de proxies e load balancers.
        const keepAlive = setInterval(() => {
            res.write(": keep-alive\n\n")
        }, 30_000)

        // Cleanup ao desconectar: remove o listener e para o keep-alive.
        // O evento "close" é emitido quando o cliente fecha a conexão
        // (fecha o browser, navega para outra página, ou chama EventSource.close()).
        req.on("close", () => {
            readingUnsub()
            alertUnsub()
            clearInterval(keepAlive)
        })
    })

    return router
}