// ─────────────────────────────────────────────────────────────────────────────
// MqttConnection — implementação do protocolo MQTT
//
// MQTT é um protocolo publish/subscribe leve, muito comum em IoT residencial
// e comercial. Funciona como uma rádio AM: o dispositivo "publica" dados em
// um canal (topic), e o backend "assina" esse canal para receber os dados.
//
// Dependência necessária: npm install mqtt
// Tipos: o próprio pacote mqtt já os inclui — não instale @types/mqtt, que é
// um stub obsoleto no DefinitelyTyped.
//
// IMPORTANTE: Esta classe é a implementação de referência. As demais
// (ModbusTcpConnection, etc.) seguirão o mesmo padrão de ciclo de vida:
//   constructor → connect() → onData() → disconnect()
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { logger } from "@/shared/logger/logger.js"

export interface MqttConnectionConfig {
    meterId: string
    host: string
    port: number
    topic: string
    username?: string
    password?: string
}

export class MqttConnection implements IConnection {
    readonly meterId: string

    private client: unknown = null
    private connected = false
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: MqttConnectionConfig

    constructor(config: MqttConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
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
        //
        // reconnectPeriod positivo (alinhado ao publisher do simulador,
        // internalPublisher.ts) para o client reconectar sozinho se o broker
        // cair depois de conectado — mesmo espírito do backoff dos demais
        // adaptadores. O caso em que a conexão nunca chegou a se estabelecer
        // é tratado à parte no listener de "error" abaixo: sem isso, um
        // client que nunca é guardado pelo IoTConnectionManager (connect()
        // rejeitou) ficaria reconectando sozinho para sempre, sem dono.
        const opts: Record<string, unknown> = { reconnectPeriod: 1000 }

        if (this.config.username !== undefined) {
            opts["username"] = this.config.username
        }

        if (this.config.password !== undefined) {
            opts["password"] = this.config.password
        }

        this.client = mqtt.connect(brokerUrl, opts as Parameters<typeof mqtt.connect>[1])

        await new Promise<void>((resolve, reject) => {
            const mqttClient = this.client as ReturnType<typeof mqtt.connect>
            let initialConnectSettled = false

            // Cobre tanto um erro de transporte antes do CONNACK quanto uma
            // falha de SUBACK logo na conexão inicial (ex.: ACL do broker
            // negando o tópico) — os dois são "a conexão inicial nunca
            // chegou a ficar utilizável", e o client precisa ser encerrado
            // antes de rejeitar: sem dono guardado pelo IoTConnectionManager
            // (que descarta a instância sem nunca chamar disconnect() nela),
            // ele ficaria reconectando sozinho para sempre com
            // reconnectPeriod > 0.
            const failInitialConnect = (err: Error): void => {
                initialConnectSettled = true
                this.connected = false
                mqttClient.end(true)
                reject(err)
            }

            mqttClient.on("connect", () => {
                // Capturado ANTES de marcar initialConnectSettled — o
                // handler "connect" dispara de novo a cada reconexão
                // automática bem-sucedida, não só na primeira vez.
                const isInitialConnect = !initialConnectSettled
                initialConnectSettled = true
                this.connected = true

                mqttClient.subscribe(this.config.topic, (err) => {
                    if (err) {
                        if (isInitialConnect) {
                            failInitialConnect(err)
                        } else {
                            // Falha ao resubscrever após uma reconexão
                            // automática (não a primeira) — connect() já
                            // resolveu há muito tempo, não há mais o que
                            // rejeitar; só registra para diagnóstico.
                            logger.warn(
                                { module: "MQTT", meterId: this.meterId, err },
                                "Falha ao resubscrever após reconexão",
                            )
                        }
                        return
                    }
                    if (isInitialConnect) resolve()
                })
            })

            mqttClient.on("error", (err) => {
                if (initialConnectSettled) {
                    // Erro após a primeira conexão — o próprio client já
                    // tenta reconectar sozinho (reconnectPeriod acima).
                    logger.warn({ module: "MQTT", meterId: this.meterId, err }, "Erro no client")
                    return
                }
                failInitialConnect(err)
            })

            mqttClient.on("close", () => {
                // Transporte caiu (ou o client está encerrando) — reflete no
                // estado antes de uma eventual reconexão automática disparar
                // "connect" de novo. Sem isto, isConnected() continuaria
                // respondendo true durante toda a indisponibilidade, agora
                // que o client reconecta sozinho em vez de desistir.
                this.connected = false
            })

            mqttClient.on("message", (_topic, payload) => {
                this._handleMessage(payload)
            })
        })
    }

    // Extraído para ser testável sem um broker real — mesmo padrão já usado
    // em `_handleSerialData` (RS-232/RS-485) e `_readSample` (Modbus/EtherNet-IP/Profinet)
    // neste diretório.
    private _handleMessage(payload: Buffer): void {
        if (!this.dataHandler) {
            return
        }

        try {
            const parsed = JSON.parse(payload.toString()) as Record<string, unknown>
            this.dataHandler(parsed)
        } catch {
            this.dataHandler({ raw: payload.toString() })
        }
    }

    async disconnect(): Promise<void> {
        if (!this.connected || !this.client) {
            return
        }

        const mqttClient = this.client as { end: (force: boolean, cb: () => void) => void }
        await new Promise<void>((resolve) => {
            mqttClient.end(false, () => resolve())
        })
        this.connected = false
        this.client = null
    }

    isConnected(): boolean {
        return this.connected
    }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}
