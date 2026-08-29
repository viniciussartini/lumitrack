// ─────────────────────────────────────────────────────────────────────────────
// ModbusTcpConnection
//
// Modbus TCP e o protocolo industrial mais comum para leitura de medidores,
// CLPs e sensores via rede Ethernet. Funciona como uma ligacao telefonica
// direta: o backend pergunta ao dispositivo qual e o valor de um registrador.
// E request/response puro — sem push. Por isso usamos polling.
//
// Dependencia: npm install jsmodbus
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { logger } from "@/shared/logger/logger.js"

export interface ModbusTcpConnectionConfig {
    meterId: string
    host: string
    port: number
    address: string // registrador de voltagem
    currentAddress: string
    powerAddress: string
    powerFactorAddress: string
    pollingIntervalMs?: number
    unitId?: number
}

type ModbusReadClient = {
    readHoldingRegisters: (
        addr: number,
        count: number,
    ) => Promise<{ response: { body: { values: number[] } } }>
}

export class ModbusTcpConnection implements IConnection {
    readonly meterId: string

    private socket: unknown = null
    private client: unknown = null
    private connected = false
    private pollingTimer: ReturnType<typeof setInterval> | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: ModbusTcpConnectionConfig

    constructor(config: ModbusTcpConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const net = await import("net")
        const jsmodbus = await import("jsmodbus")

        this.socket = new net.Socket()
        this.client = new jsmodbus.client.TCP(
            this.socket as import("net").Socket,
            this.config.unitId ?? 1,
        )

        await new Promise<void>((resolve, reject) => {
            const socket = this.socket as import("net").Socket
            socket.connect({ host: this.config.host, port: this.config.port }, () => {
                this.connected = true
                this._startPolling()
                resolve()
            })
            socket.on("error", reject)
        })
    }

    // Modbus e request/response — nao ha push de dados do dispositivo.
    // Polling: a cada intervalo o backend le os 4 registradores configurados
    // (voltage/current/power/powerFactor) e combina numa amostra só.
    private _startPolling(): void {
        const intervalMs = this.config.pollingIntervalMs ?? 5000

        this.pollingTimer = setInterval(() => {
            // setInterval espera um callback () => void — o corpo é async por
            // causa do await de leitura, então roda numa IIFE `void`ada. O
            // try/catch abaixo já cobre 100% do corpo, então a promise nunca
            // rejeita de verdade; isto só satisfaz o tipo (no-misused-promises).
            void (async () => {
                if (!this.dataHandler || !this.client) {
                    return
                }

                try {
                    const sample = await this._readSample()
                    this.dataHandler(sample)
                } catch (err) {
                    logger.error(
                        { module: "ModbusTCP", meterId: this.meterId, err },
                        "Erro na leitura",
                    )
                }
            })()
        }, intervalMs)
    }

    // Extraído do corpo do polling para ser testável sem um socket real —
    // mesmo padrão já usado em Rs232Connection/Rs485Connection para
    // `_handleSerialData`. Lê os 4 registradores em sequência: Modbus é
    // request/response sobre uma única conexão, leituras concorrentes no
    // mesmo socket intercalariam respostas.
    private async _readSample(): Promise<Record<string, unknown>> {
        const client = this.client as ModbusReadClient
        const readOne = async (address: string): Promise<number> => {
            const result = await client.readHoldingRegisters(parseInt(address, 10), 1)
            // NaN se o dispositivo devolver uma resposta vazia — inválido,
            // mesmo tratamento que IoTDataProcessor já dá a qualquer valor
            // não numérico (isFiniteInRange rejeita).
            return result.response.body.values[0] ?? NaN
        }

        const voltage = await readOne(this.config.address)
        const current = await readOne(this.config.currentAddress)
        const powerW = await readOne(this.config.powerAddress)
        const powerFactor = await readOne(this.config.powerFactorAddress)

        return { voltage, current, powerW, powerFactor, deviceTimestamp: new Date().toISOString() }
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        if (this.pollingTimer) {
            clearInterval(this.pollingTimer)
            this.pollingTimer = null
        }

        const socket = this.socket as import("net").Socket
        socket.destroy()
        this.connected = false
        this.socket = null
        this.client = null
    }

    isConnected(): boolean {
        return this.connected
    }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}
