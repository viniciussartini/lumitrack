// ─────────────────────────────────────────────────────────────────────────────
// ModbusRtuConnection
//
// Modbus RTU roda sobre RS-485 ou RS-232 (serial fisico).
// Nao ha TCP/IP — a comunicacao e feita pela porta serial do servidor.
//
// Dependencia: npm install serialport jsmodbus
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { logger } from "@/shared/logger/logger.js"

export interface ModbusRtuConnectionConfig {
    meterId: string
    address: string // caminho da porta serial, ex: "/dev/ttyUSB0" ou "COM3"
    baudRate?: number // (do campo extra) padrao 9600
    pollingIntervalMs?: number
    unitId?: number
}

export class ModbusRtuConnection implements IConnection {
    readonly meterId: string

    private port: unknown = null
    private client: unknown = null
    private connected = false
    private pollingTimer: ReturnType<typeof setInterval> | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: ModbusRtuConnectionConfig

    constructor(config: ModbusRtuConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const { SerialPort } = await import("serialport")
        const jsmodbus = await import("jsmodbus")

        this.port = new SerialPort({
            path: this.config.address,
            baudRate: this.config.baudRate ?? 9600,
            autoOpen: false,
        })

        const serialPort = this.port as InstanceType<typeof SerialPort>

        this.client = new jsmodbus.client.RTU(serialPort, this.config.unitId ?? 1)

        await new Promise<void>((resolve, reject) => {
            serialPort.open((err) => {
                if (err) {
                    reject(err)
                    return
                }

                this.connected = true
                this._startPolling()
                resolve()
            })
        })
    }

    private _startPolling(): void {
        const intervalMs = this.config.pollingIntervalMs ?? 5000

        this.pollingTimer = setInterval(() => {
            void (async () => {
                if (!this.dataHandler || !this.client) {
                    return
                }

                try {
                    const modbusClient = this.client as {
                        readHoldingRegisters: (
                            addr: number,
                            count: number,
                        ) => Promise<{
                            response: { body: { values: number[] } }
                        }>
                    }
                    const result = await modbusClient.readHoldingRegisters(0, 1)
                    const value = result.response.body.values[0]
                    this.dataHandler({
                        port: this.config.address,
                        value,
                        timestamp: new Date().toISOString(),
                    })
                } catch (err) {
                    logger.error(
                        { module: "ModbusRTU", meterId: this.meterId, err },
                        "Erro na leitura",
                    )
                }
            })()
        }, intervalMs)
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        if (this.pollingTimer) {
            clearInterval(this.pollingTimer)
            this.pollingTimer = null
        }
        const serialPort = this.port as { close: (cb?: (err?: Error | null) => void) => void }
        await new Promise<void>((resolve) => serialPort.close(() => resolve()))
        this.connected = false
        this.port = null
        this.client = null
    }

    isConnected(): boolean {
        return this.connected
    }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}
