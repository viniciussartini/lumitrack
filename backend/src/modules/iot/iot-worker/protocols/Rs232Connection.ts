// ─────────────────────────────────────────────────────────────────────────────
// Rs232Connection
//
// RS-232 e uma interface serial ponto-a-ponto — conecta um unico dispositivo
// ao servidor. Muito comum em medidores de energia e equipamentos legados.
// Velocidade tipica: 9600 a 115200 baud.
//
// Dependencia: npm install serialport
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { SerialLineParser } from "@/modules/iot/iot-worker/protocols/serialLineParser.js"

export interface Rs232ConnectionConfig {
    meterId: string
    address: string
    baudRate?: number
    dataBits?: 5 | 6 | 7 | 8
    stopBits?: 1 | 1.5 | 2
    parity?: "none" | "even" | "odd" | "mark" | "space"
    pollingIntervalMs?: number
}

export class Rs232Connection implements IConnection {
    readonly meterId: string

    private port: unknown = null
    private connected = false
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: Rs232ConnectionConfig
    private readonly lineParser: SerialLineParser

    constructor(config: Rs232ConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
        this.lineParser = new SerialLineParser({
            meterId: this.meterId,
            moduleTag: "RS232",
            onLine: (parsed) => this.dataHandler?.(parsed),
            buildRawFallback: (trimmed) => ({ raw: trimmed, timestamp: new Date().toISOString() }),
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

        const { SerialPort } = await import("serialport")

        const serialPort = new SerialPort({
            path: this.config.address,
            baudRate: this.config.baudRate ?? 9600,
            dataBits: this.config.dataBits ?? 8,
            stopBits: this.config.stopBits ?? 1,
            parity: this.config.parity ?? "none",
            autoOpen: false,
        })
        this.port = serialPort

        await new Promise<void>((resolve, reject) => {
            serialPort.open((err) => {
                if (err) reject(err)
                else {
                    this.connected = true
                    resolve()
                }
            })
        })

        // RS-232 e ponto-a-ponto orientado a eventos — o dispositivo envia
        // dados quando tem algo a reportar, sem precisar ser interrogado.
        // Acumulamos fragmentos no buffer e processamos linhas completas
        // (extraído em `_handleSerialData` para ser testável sem depender
        // de um SerialPort real ou mockado).
        serialPort.on("data", (chunk: Buffer) => {
            this._handleSerialData(chunk)
        })
    }

    // Exposto como método (não inline) para ser chamado diretamente pelo
    // teste — casar com o "data" de um SerialPort real exigiria mockar o
    // pacote `serialport`, fora do padrão de teste já usado neste arquivo.
    private _handleSerialData(chunk: Buffer): void {
        this.lineParser.feed(chunk)
    }

    async disconnect(): Promise<void> {
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
