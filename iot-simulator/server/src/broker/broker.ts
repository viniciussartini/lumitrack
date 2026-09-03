import { timingSafeEqual } from "crypto"
import { Aedes } from "aedes"
import { createServer, type Server } from "net"
import { logger } from "@/shared/logger.js"

const log = logger.child({ module: "broker" })

export interface EmbeddedBroker {
    // Retorna a porta efetivamente vinculada — igual a `port` quando um
    // valor explícito é passado; útil em testes, que passam 0 para o SO
    // escolher uma porta livre e evitar colisão entre execuções paralelas.
    start(port: number, host?: string): Promise<number>
    stop(): Promise<void>
}

export interface BrokerCredentials {
    username: string
    password: string
}

// Compara em tempo constante, mesmo padrão de api/middlewares/apiToken.ts.
function bufferEquals(a: Buffer, b: Buffer): boolean {
    return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Cria um broker MQTT embutido (aedes), autenticado por usuário/senha fixos.
 *
 * @param credentials Usuário/senha exigidos de todo cliente MQTT.
 * @param credentials.username Usuário exigido na autenticação.
 * @param credentials.password Senha exigida na autenticação.
 * @returns O broker, com `start`/`stop` para controlar seu ciclo de vida.
 */
export function createBroker({ username, password }: BrokerCredentials): EmbeddedBroker {
    const aedes = new Aedes()
    let server: Server | null = null
    const expectedUsername = Buffer.from(username)
    const expectedPassword = Buffer.from(password)

    // Sem credencial batendo exatamente, nenhum cliente conecta — nem o
    // publisher interno da própria simulação, nem o backend real. Antes
    // disso o broker aceitava qualquer cliente anônimo.
    aedes.authenticate = (_client, clientUsername, clientPassword, callback) => {
        const usernameOk = clientUsername !== undefined && clientUsername !== null
        const passwordOk = clientPassword !== undefined && clientPassword !== null

        const valid =
            usernameOk &&
            passwordOk &&
            bufferEquals(Buffer.from(clientUsername), expectedUsername) &&
            bufferEquals(Buffer.from(clientPassword), expectedPassword)

        callback(null, valid)
    }

    // Sem ACL por tópico: um único broker embutido, um único consumidor de
    // confiança (o backend real) — qualquer cliente que já passou pelo
    // `authenticate` acima pode publicar em qualquer tópico. Desenhar
    // permissão por tópico é over-engineering sem um segundo consumidor
    // (YAGNI, 06-code-quality-standards.md).
    aedes.authorizePublish = (_client, _packet, callback) => callback(null)

    aedes.on("client", (client) => log.debug({ clientId: client.id }, "Cliente MQTT conectado"))
    aedes.on("clientDisconnect", (client) =>
        log.debug({ clientId: client.id }, "Cliente MQTT desconectado"),
    )

    async function start(port: number, host = "127.0.0.1"): Promise<number> {
        // Aedes 1.x precisa de listen() explícito para inicializar sua
        // persistência interna antes de aceitar conexões — sem isso, o
        // handshake MQTT trava silenciosamente (o socket TCP conecta, mas
        // nenhum CONNACK é enviado e nenhum evento de erro é emitido).
        await aedes.listen()
        server = createServer(aedes.handle)
        const boundPort = await new Promise<number>((resolve, reject) => {
            server!.once("error", reject)
            server!.listen(port, host, () => {
                const address = server!.address()
                const actualPort =
                    typeof address === "object" && address !== null ? address.port : port
                resolve(actualPort)
            })
        })
        log.info(`Broker MQTT embutido em mqtt://${host}:${boundPort}`)
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
