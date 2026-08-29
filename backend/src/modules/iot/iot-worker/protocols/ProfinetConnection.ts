// ─────────────────────────────────────────────────────────────────────────────
// ProfinetConnection
//
// PROFINET e o sucessor moderno do PROFIBUS — roda sobre Ethernet padrao
// (TCP/IP e UDP) e e amplamente usado em automacao Siemens moderna.
// Suporta comunicacao em tempo real (RT) e isocrona (IRT).
//
// Dependencia: npm install node-snap7  (S7 PLC — protocolo comum com PROFINET)
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { logger } from "@/shared/logger/logger.js"

export interface ProfinetConnectionConfig {
    meterId: string
    host: string
    port?: number
    address: string // area de memoria da voltagem, ex: "DB1" (Data Block 1)
    currentAddress: string
    powerAddress: string
    powerFactorAddress: string
    pollingIntervalMs?: number
    rack?: number // rack do PLC Siemens (padrao 0)
    slot?: number // slot da CPU (padrao 1)
}

type S7ReadClient = {
    DBRead: (
        db: number,
        start: number,
        size: number,
        cb: (err: Error | null, data: Buffer) => void,
    ) => void
}

export class ProfinetConnection implements IConnection {
    readonly meterId: string

    private client: unknown = null
    private connected = false
    private pollingTimer: ReturnType<typeof setInterval> | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: ProfinetConnectionConfig

    constructor(config: ProfinetConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const S7 = await import("node-snap7").catch(() => {
            throw new Error(
                `[Profinet] Pacote "node-snap7" nao encontrado. Execute: npm install node-snap7`,
            )
        })

        this.client = new S7.S7Client()
        const client = this.client as {
            ConnectTo: (
                host: string,
                rack: number,
                slot: number,
                cb: (err: Error | null) => void,
            ) => void
        }

        await new Promise<void>((resolve, reject) => {
            client.ConnectTo(
                this.config.host,
                this.config.rack ?? 0,
                this.config.slot ?? 1,
                (err) => {
                    if (err) reject(err)
                    else {
                        this.connected = true
                        resolve()
                    }
                },
            )
        })

        this._startPolling()
    }

    private _startPolling(): void {
        const intervalMs = this.config.pollingIntervalMs ?? 5000

        this.pollingTimer = setInterval(() => {
            void (async () => {
                if (!this.dataHandler || !this.client) {
                    return
                }

                try {
                    const sample = await this._readSample()
                    this.dataHandler(sample)
                } catch (err) {
                    logger.error(
                        { module: "Profinet", meterId: this.meterId, err },
                        "Erro na leitura",
                    )
                }
            })()
        }, intervalMs)
    }

    // Extraído para ser testável sem um PLC S7 real. Lê os 4 data blocks
    // configurados (voltage/current/power/powerFactor) em sequência — mesma
    // conexão S7Client compartilhada, sem garantia de leituras concorrentes.
    //
    // Convenção adotada (não há dispositivo real conectado hoje para
    // validar contra um layout de fábrica): os 2 primeiros bytes do bloco
    // lido são interpretados como um WORD (UInt16BE) — o tipo mais comum
    // para uma grandeza escalar num DB Siemens. Ajustar aqui quando um
    // dispositivo real definir o layout verdadeiro do DB.
    private async _readSample(): Promise<Record<string, unknown>> {
        const client = this.client as S7ReadClient
        const readOne = async (address: string): Promise<number> => {
            const dbNumber = parseInt(address.replace("DB", ""), 10) || 1
            const data = await new Promise<Buffer>((resolve, reject) => {
                client.DBRead(dbNumber, 0, 2, (err, buf) => {
                    if (err) reject(err)
                    else resolve(buf)
                })
            })
            return data.readUInt16BE(0)
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

        const client = this.client as { Disconnect: () => void }
        client.Disconnect()
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
