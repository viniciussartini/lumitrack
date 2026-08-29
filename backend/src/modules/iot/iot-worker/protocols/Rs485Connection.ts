// ─────────────────────────────────────────────────────────────────────────────
// Rs485Connection
//
// RS-485 e uma interface serial multipoint (multi-drop) — permite conectar
// ate 32 dispositivos no mesmo par de fios. Muito usado com Modbus RTU,
// medidores de energia e sensores industriais em longas distancias (ate 1200m).
//
// A diferenca principal para RS-232: RS-485 e half-duplex (nao envia e recebe
// ao mesmo tempo) e usa sinal diferencial (mais robusto contra ruido eletrico).
//
// Dependencia: npm install serialport
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { SerialLineParser } from "@/modules/iot/iot-worker/protocols/serialLineParser.js"
import { scheduleReconnect } from "@/modules/iot/iot-worker/protocols/reconnectBackoff.js"
import { logger } from "@/shared/logger/logger.js"

export interface Rs485ConnectionConfig {
    meterId: string
    address: string // porta serial, ex: "/dev/ttyUSB0" ou "COM3"
    baudRate?: number
    dataBits?: 5 | 6 | 7 | 8
    stopBits?: 1 | 1.5 | 2
    parity?: "none" | "even" | "odd" | "mark" | "space"
    pollingIntervalMs?: number
}

export class Rs485Connection implements IConnection {
    readonly meterId: string

    private port: unknown = null
    private connected = false
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: Rs485ConnectionConfig
    private readonly lineParser: SerialLineParser
    private intentionallyDisconnected = false

    constructor(config: Rs485ConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
        this.lineParser = new SerialLineParser({
            meterId: this.meterId,
            moduleTag: "RS485",
            onLine: (parsed) => this.dataHandler?.(parsed),
            buildRawFallback: (trimmed) => ({
                raw: trimmed,
                port: this.config.address,
                timestamp: new Date().toISOString(),
            }),
        })
    }

    // Público (não privado) para o comportamento observável de `buffer`
    // (usado por teste de caracterização) continuar disponível diretamente
    // na conexão, mesmo com o buffering movido para o SerialLineParser
    // compartilhado — sem consumidor interno, um getter privado seria
    // sinalizado como não utilizado (`noUnusedLocals`).
    get buffer(): string {
        return this.lineParser.buffer
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        this.intentionallyDisconnected = false

        const { SerialPort } = await import("serialport")

        this.port = new SerialPort({
            path: this.config.address,
            baudRate: this.config.baudRate ?? 9600,
            dataBits: this.config.dataBits ?? 8,
            stopBits: this.config.stopBits ?? 1,
            parity: this.config.parity ?? "none",
            autoOpen: false,
        })

        const serialPort = this.port as InstanceType<typeof SerialPort>

        await new Promise<void>((resolve, reject) => {
            serialPort.open((err) => {
                if (err) reject(err)
                else {
                    this.connected = true
                    resolve()
                }
            })
        })

        // RS-485 multipoint — dispositivos enviam dados de forma assincrona.
        // O mesmo padrao de buffer de linhas que o Rs232Connection (extraído
        // em `_handleSerialData` pelo mesmo motivo de testabilidade).
        serialPort.on("data", (chunk: Buffer) => {
            this._handleSerialData(chunk)
        })

        // Queda do transporte depois de já conectado — antes não havia
        // reconexão nenhuma.
        serialPort.on("close", () => this._handleTransportDown())
        serialPort.on("error", (err) => {
            logger.error(
                { module: "RS485", meterId: this.meterId, err },
                "Erro no transporte serial",
            )
            this._handleTransportDown()
        })
    }

    private _handleTransportDown(): void {
        if (this.intentionallyDisconnected || !this.connected) {
            return
        }

        this.connected = false
        this.port = null
        this.lineParser.reset()

        scheduleReconnect({
            meterId: this.meterId,
            moduleTag: "RS485",
            reconnect: () => this.connect(),
            isStopped: () => this.intentionallyDisconnected,
        })
    }

    private _handleSerialData(chunk: Buffer): void {
        this.lineParser.feed(chunk)
    }

    async disconnect(): Promise<void> {
        this.intentionallyDisconnected = true

        if (!this.connected) {
            return
        }

        const serialPort = this.port as { close: (cb?: (err?: Error | null) => void) => void }
        await new Promise<void>((resolve) => serialPort.close(() => resolve()))
        this.connected = false
        this.port = null
        this.lineParser.reset()
    }

    isConnected(): boolean {
        return this.connected
    }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}
