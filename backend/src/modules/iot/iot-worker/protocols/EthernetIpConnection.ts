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
import { PollingLoop } from "@/modules/iot/iot-worker/protocols/pollingLoop.js"
import { scheduleReconnect } from "@/modules/iot/iot-worker/protocols/reconnectBackoff.js"

export interface EthernetIpConnectionConfig {
    meterId: string
    host: string
    port?: number
    address: string // tag CIP de voltagem, ex: "Motor.Speed"
    currentAddress: string
    powerAddress: string
    powerFactorAddress: string
    pollingIntervalMs?: number
}

export class EthernetIpConnection implements IConnection {
    readonly meterId: string

    private plc: import("ethernet-ip").PLC | null = null
    private connected = false
    private pollingLoop: PollingLoop | null = null
    private dataHandler: ((data: Record<string, unknown>) => void) | null = null
    private readonly config: EthernetIpConnectionConfig
    private intentionallyDisconnected = false

    constructor(config: EthernetIpConnectionConfig) {
        this.meterId = config.meterId
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        this.intentionallyDisconnected = false

        const { PLC } = await import("ethernet-ip")

        this.plc = new PLC()
        await this.plc.connect(this.config.host, { slot: 0 })
        this.connected = true
        this._startPolling()
    }

    private _startPolling(): void {
        this.pollingLoop = new PollingLoop({
            intervalMs: this.config.pollingIntervalMs ?? 5000,
            shouldRun: () => this.dataHandler !== null && this.plc !== null,
            readSample: () => this._readSample(),
            onSample: (sample) => this.dataHandler?.(sample),
            onError: (err) => {
                logger.error(
                    { module: "EthernetIP", meterId: this.meterId, err },
                    "Erro na leitura",
                )
            },
            onUnhealthy: () => this._handleUnhealthy(),
        })
        this.pollingLoop.start()
    }

    private _handleUnhealthy(): void {
        void this._cleanup().then(() => {
            scheduleReconnect({
                meterId: this.meterId,
                moduleTag: "EthernetIP",
                reconnect: () => this.connect(),
                isStopped: () => this.intentionallyDisconnected,
            })
        })
    }

    // Extraído para ser testável sem um PLC real. Lê as 4 tags CIP
    // configuradas (voltage/current/power/powerFactor) em sequência —
    // leituras concorrentes sobre a mesma conexão PLC não são garantidas
    // pela lib.
    private async _readSample(): Promise<Record<string, unknown>> {
        const plc = this.plc as import("ethernet-ip").PLC
        const voltage = await plc.read(this.config.address)
        const current = await plc.read(this.config.currentAddress)
        const powerW = await plc.read(this.config.powerAddress)
        const powerFactor = await plc.read(this.config.powerFactorAddress)

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
