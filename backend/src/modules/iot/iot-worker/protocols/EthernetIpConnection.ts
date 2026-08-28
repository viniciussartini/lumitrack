// ─────────────────────────────────────────────────────────────────────────────
// EthernetIpConnection
//
// EtherNet/IP e o protocolo da Rockwell/Allen-Bradley para PLCs industriais.
// Roda sobre TCP/IP e usa o protocolo CIP (Common Industrial Protocol).
//
// Dependencia: npm install ethernet-ip (API v2 — classe PLC, plc.connect(host,
// {slot}), plc.read(tag), plc.disconnect() assincrono)
// ─────────────────────────────────────────────────────────────────────────────

import type { IConnection } from "@/modules/iot/iot-worker/protocols/IConnection.js"
import { logger } from "@/shared/logger/logger.js"

export interface EthernetIpConnectionConfig {
    meterId: string
    host: string
    port?: number
    address?: string // tag CIP a monitorar, ex: "Motor.Speed"
    pollingIntervalMs?: number
}

export class EthernetIpConnection implements IConnection {
    readonly meterId: string

    private plc: import("ethernet-ip").PLC | null = null
    private connected = false
    private pollingTimer: ReturnType<typeof setInterval> | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: EthernetIpConnectionConfig

    constructor(config: EthernetIpConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        const { PLC } = await import("ethernet-ip")

        this.plc = new PLC()
        await this.plc.connect(this.config.host, { slot: 0 })
        this.connected = true
        this._startPolling()
    }

    private _startPolling(): void {
        const intervalMs = this.config.pollingIntervalMs ?? 5000
        const tag = this.config.address ?? "output"

        this.pollingTimer = setInterval(() => {
            void (async () => {
                if (!this.dataHandler || !this.plc) {
                    return
                }

                try {
                    const value = await this.plc.read(tag)
                    this.dataHandler({ tag, value, timestamp: new Date().toISOString() })
                } catch (err) {
                    logger.error(
                        { module: "EthernetIP", meterId: this.meterId, err },
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

        await this.plc?.disconnect()
        this.connected = false
        this.plc = null
    }

    isConnected(): boolean {
        return this.connected
    }

    onData(handler: (data: Record<string, unknown>) => void): void {
        this.dataHandler = handler
    }
}
