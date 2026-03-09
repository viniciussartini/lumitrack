// ─────────────────────────────────────────────────────────────────────────────
// MqttConnection — implementação do protocolo MQTT
//
// MQTT é um protocolo publish/subscribe leve, muito comum em IoT residencial
// e comercial. Funciona como uma rádio AM: o dispositivo "publica" dados em
// um canal (topic), e o backend "assina" esse canal para receber os dados.
//
// Dependência necessária: npm install mqtt
// Tipos: npm install --save-dev @types/mqtt (ou mqtt já inclui seus próprios tipos)
//
// IMPORTANTE: Esta classe é a implementação de referência. As demais
// (ModbusTcpConnection, etc.) seguirão o mesmo padrão de ciclo de vida:
//   constructor → connect() → onData() → disconnect()
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"

export interface MqttConnectionConfig {
    deviceId: string
    host: string
    port: number
    topic: string
    username?: string
    password?: string
}

export class MqttConnection implements IConnection {
    readonly deviceId: string

    private client: unknown = null
    private connected = false
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: MqttConnectionConfig

    constructor(config: MqttConnectionConfig) {
        this.deviceId = config.deviceId
        this.config   = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const mqtt = await import("mqtt")
        const brokerUrl = `mqtt://${this.config.host}:${this.config.port}`

        // Com exactOptionalPropertyTypes: true, nao podemos passar username: undefined
        // diretamente se o tipo IClientOptions da lib nao aceita undefined explicito.
        // Construimos o objeto condicionalmente.
        const opts: Record<string, unknown> = { reconnectPeriod: 0 }

        if (this.config.username !== undefined) {
            opts["username"] = this.config.username
        }

        if (this.config.password !== undefined) {
            opts["password"] = this.config.password
        }

        this.client = mqtt.connect(brokerUrl, opts as Parameters<typeof mqtt.connect>[1])

        await new Promise<void>((resolve, reject) => {
            const mqttClient = this.client as ReturnType<typeof mqtt.connect>

            mqttClient.on("connect", () => {
                this.connected = true
                mqttClient.subscribe(this.config.topic, (err) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })

            mqttClient.on("error", (err) => reject(err))

            mqttClient.on("message", (_topic, payload) => {
                if (!this.dataHandler) {
                    return
                }
                
                try {
                    const parsed = JSON.parse(payload.toString()) as Record<string, unknown>
                    this.dataHandler(parsed)
                } catch {
                    this.dataHandler({ raw: payload.toString() })
                }
            })
        })
    }

    async disconnect(): Promise<void> {
        if (!this.connected || !this.client) {
            return
        }

        const mqttClient = this.client as { end: (force: boolean, cb: () => void) => void }
        await new Promise<void>((resolve) => { mqttClient.end(false, () => resolve()) })
        this.connected = false
        this.client    = null
    }

    isConnected(): boolean { return this.connected }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}