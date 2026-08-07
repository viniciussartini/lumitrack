import { Aedes } from "aedes"
import { createServer, type Server } from "net"
import { logger } from "@/shared/logger.js"

const log = logger.child({ module: "broker" })

export interface EmbeddedBroker {
    // Retorna a porta efetivamente vinculada — igual a `port` quando um
    // valor explícito é passado; útil em testes, que passam 0 para o SO
    // escolher uma porta livre e evitar colisão entre execuções paralelas.
    start(port: number): Promise<number>
    stop(): Promise<void>
}

export function createBroker(): EmbeddedBroker {
    const aedes = new Aedes()
    let server: Server | null = null

    aedes.on("client", (client) => log.debug({ clientId: client.id }, "Cliente MQTT conectado"))
    aedes.on("clientDisconnect", (client) =>
        log.debug({ clientId: client.id }, "Cliente MQTT desconectado"),
    )

    async function start(port: number): Promise<number> {
        // Aedes 1.x precisa de listen() explícito para inicializar sua
        // persistência interna antes de aceitar conexões — sem isso, o
        // handshake MQTT trava silenciosamente (o socket TCP conecta, mas
        // nenhum CONNACK é enviado e nenhum evento de erro é emitido).
        await aedes.listen()
        server = createServer(aedes.handle)
        const boundPort = await new Promise<number>((resolve, reject) => {
            server!.once("error", reject)
            server!.listen(port, () => {
                const address = server!.address()
                const actualPort =
                    typeof address === "object" && address !== null ? address.port : port
                resolve(actualPort)
            })
        })
        log.info(`Broker MQTT embutido em mqtt://localhost:${boundPort}`)
        return boundPort
    }

    async function stop(): Promise<void> {
        if (server) {
            await new Promise<void>((resolve) => server!.close(() => resolve()))
            server = null
        }
        await new Promise<void>((resolve) => aedes.close(() => resolve()))
    }

    return { start, stop }
}
