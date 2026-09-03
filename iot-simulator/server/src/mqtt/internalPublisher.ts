import mqtt, { type MqttClient } from "mqtt"
import { logger } from "@/shared/logger.js"

const log = logger.child({ module: "internalPublisher" })

export interface InternalPublisher {
    connect(): Promise<void>
    disconnect(): Promise<void>
    publish(topic: string, payload: unknown): void
    isConnected(): boolean
}

export interface InternalPublisherCredentials {
    username: string
    password: string
}

/**
 * Cria um cliente MQTT interno que publica no broker embutido, replicando o
 * mesmo padrão de conexão sem TLS usado por MqttConnection.ts no backend
 * real. Credenciais obrigatórias — o broker embutido exige autenticação de
 * todo cliente, inclusive deste publisher interno.
 *
 * @param brokerUrl URL `mqtt://` do broker embutido.
 * @param credentials Usuário/senha exigidos pelo broker.
 * @param credentials.username Usuário usado na conexão.
 * @param credentials.password Senha usada na conexão.
 * @returns O publisher, com `connect`/`disconnect`/`publish`/`isConnected`.
 */
export function createInternalPublisher(
    brokerUrl: string,
    { username, password }: InternalPublisherCredentials,
): InternalPublisher {
    let client: MqttClient | null = null
    let connected = false

    async function connect(): Promise<void> {
        client = mqtt.connect(brokerUrl, { reconnectPeriod: 1000, username, password })
        await new Promise<void>((resolve, reject) => {
            client!.once("connect", () => {
                connected = true
                resolve()
            })
            client!.once("error", reject)
        })
    }

    async function disconnect(): Promise<void> {
        if (!client) return
        await new Promise<void>((resolve) => client!.end(false, {}, () => resolve()))
        connected = false
        client = null
    }

    function publish(topic: string, payload: unknown): void {
        if (!client || !connected) {
            log.warn({ topic }, "Publish ignorado — publisher desconectado")
            return
        }
        client.publish(topic, JSON.stringify(payload))
    }

    return { connect, disconnect, publish, isConnected: () => connected }
}
