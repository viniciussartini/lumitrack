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
import { PollingLoop } from "@/modules/iot/iot-worker/protocols/pollingLoop.js"
import { cleanupThenReconnect } from "@/modules/iot/iot-worker/protocols/reconnectBackoff.js"

export interface ModbusRtuConnectionConfig {
    meterId: string
    address: string // caminho da porta serial, ex: "/dev/ttyUSB0" ou "COM3"
    voltageAddress: string // registrador de voltagem — RTU não tem "address" livre para isso
    currentAddress: string
    powerAddress: string
    powerFactorAddress: string
    baudRate?: number // (do campo extra) padrao 9600
    pollingIntervalMs?: number
    unitId?: number
}

type ModbusReadClient = {
    readHoldingRegisters: (
        addr: number,
        count: number,
    ) => Promise<{ response: { body: { values: number[] } } }>
}

export class ModbusRtuConnection implements IConnection {
    readonly meterId: string

    private port: unknown = null
    private client: unknown = null
    private connected = false
    private pollingLoop: PollingLoop | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: ModbusRtuConnectionConfig
    private intentionallyDisconnected = false

    constructor(config: ModbusRtuConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        this.intentionallyDisconnected = false

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

        // Fecha a janela de corrida: ver comentário equivalente em
        // ModbusTcpConnection.connect().
        if (this.intentionallyDisconnected) {
            await this._cleanup()
        }
    }

    private _startPolling(): void {
        this.pollingLoop = new PollingLoop({
            intervalMs: this.config.pollingIntervalMs ?? 5000,
            shouldRun: () => this.dataHandler !== null && this.client !== null,
            readSample: () => this._readSample(),
            onSample: (sample) => this.dataHandler?.(sample),
            onError: (err) => {
                logger.error({ module: "ModbusRTU", meterId: this.meterId, err }, "Erro na leitura")
            },
            onUnhealthy: () => this._handleUnhealthy(),
        })
        this.pollingLoop.start()
    }

    private _handleUnhealthy(): void {
        cleanupThenReconnect({
            meterId: this.meterId,
            moduleTag: "ModbusRTU",
            cleanup: () => this._cleanup(),
            reconnect: () => this.connect(),
            isStopped: () => this.intentionallyDisconnected,
        })
    }

    // Extraído para ser testável sem uma porta serial real. Antes lia sempre
    // o registrador 0, ignorando qualquer endereço configurado — agora lê
    // os 4 registradores configurados (voltage/current/power/powerFactor),
    // em sequência: assim como o Modbus TCP, é request/response sobre uma
    // única conexão.
    //
    // Mesma limitação de escala do Modbus TCP — ver comentário em
    // ModbusTcpConnection._readSample(). Rastreado em #315.
    private async _readSample(): Promise<Record<string, unknown>> {
        const client = this.client as ModbusReadClient
        const readOne = async (address: string): Promise<number> => {
            const result = await client.readHoldingRegisters(parseInt(address, 10), 1)
            // NaN se o dispositivo devolver uma resposta vazia — inválido,
            // mesmo tratamento que IoTDataProcessor já dá a qualquer valor
            // não numérico (isFiniteInRange rejeita).
            return result.response.body.values[0] ?? NaN
        }

        const voltage = await readOne(this.config.voltageAddress)
        const current = await readOne(this.config.currentAddress)
        const powerW = await readOne(this.config.powerAddress)
        const powerFactor = await readOne(this.config.powerFactorAddress)

        return { voltage, current, powerW, powerFactor, deviceTimestamp: new Date().toISOString() }
    }

    async disconnect(): Promise<void> {
        this.intentionallyDisconnected = true
        await this._cleanup()
    }

    private async _cleanup(): Promise<void> {
        if (!this.connected) {
            return
        }

        this.pollingLoop?.stop()
        this.pollingLoop = null

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
