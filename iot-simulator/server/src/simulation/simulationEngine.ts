import type { SimulationStore } from "@/simulation/store.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"
import type { AnomalyState, VirtualDevice } from "@/simulation/types.js"
import { DeviceRunner } from "@/simulation/deviceRunner.js"

const ANOMALY_SCAN_INTERVAL_MS = 1000

/**
 * Orquestra os `DeviceRunner`s (start/stop por device) e expira anomalias
 * por tempo, sem exigir que o chamador lembre de desativá-las manualmente.
 */
export class SimulationEngine {
    private readonly runners = new Map<string, DeviceRunner>()
    private anomalyScanTimer: NodeJS.Timeout | null = null

    /**
     * @param store Store da simulação (devices, redes, anomalias).
     * @param publisher Cliente MQTT repassado a cada `DeviceRunner` criado.
     */
    constructor(
        private readonly store: SimulationStore,
        private readonly publisher: InternalPublisher,
    ) {}

    /** Inicia a varredura periódica de anomalias expiradas, se ainda não estiver rodando. */
    startEngine(): void {
        if (this.anomalyScanTimer) return
        this.anomalyScanTimer = setInterval(
            () => this.scanExpiredAnomalies(),
            ANOMALY_SCAN_INTERVAL_MS,
        )
    }

    /** Para a varredura de anomalias e todos os `DeviceRunner`s ativos. */
    stopEngine(): void {
        if (this.anomalyScanTimer) {
            clearInterval(this.anomalyScanTimer)
            this.anomalyScanTimer = null
        }
        for (const runner of this.runners.values()) runner.stop()
        this.runners.clear()
    }

    /**
     * Liga um device — cria o `DeviceRunner` na primeira vez, reaproveita
     * nas seguintes.
     *
     * @param deviceId Id do device a ligar.
     * @returns O device atualizado, ou `undefined` se não existir.
     */
    powerOn(deviceId: string): VirtualDevice | undefined {
        const device = this.store.setPower(deviceId, true)
        if (!device) return undefined

        let runner = this.runners.get(deviceId)
        if (!runner) {
            runner = new DeviceRunner(deviceId, this.store, this.publisher)
            this.runners.set(deviceId, runner)
        }
        runner.start()
        return device
    }

    /**
     * Desliga um device e para seu `DeviceRunner`, se houver.
     *
     * @param deviceId Id do device a desligar.
     * @returns O device atualizado, ou `undefined` se não existir.
     */
    powerOff(deviceId: string): VirtualDevice | undefined {
        const device = this.store.setPower(deviceId, false)
        this.runners.get(deviceId)?.stop()
        return device
    }

    /**
     * Remove um device da simulação, parando e descartando seu runner.
     *
     * @param deviceId Id do device a remover.
     */
    removeDevice(deviceId: string): void {
        this.runners.get(deviceId)?.stop()
        this.runners.delete(deviceId)
    }

    /**
     * Ativa uma anomalia temporária (multiplicador de potência) num device.
     *
     * @param deviceId Id do device afetado.
     * @param multiplier Multiplicador aplicado à potência nominal.
     * @param durationSeconds Duração da anomalia, em segundos.
     * @returns O device atualizado, ou `undefined` se não existir.
     */
    triggerAnomaly(
        deviceId: string,
        multiplier: number,
        durationSeconds: number,
    ): VirtualDevice | undefined {
        const anomaly: AnomalyState = {
            active: true,
            multiplier,
            endsAt: Date.now() + durationSeconds * 1000,
        }
        return this.store.setAnomaly(deviceId, anomaly)
    }

    /**
     * Encerra manualmente uma anomalia ativa, antes do prazo expirar sozinho.
     *
     * @param deviceId Id do device afetado.
     * @returns O device atualizado, ou `undefined` se não existir.
     */
    clearAnomaly(deviceId: string): VirtualDevice | undefined {
        return this.store.clearAnomaly(deviceId)
    }

    private scanExpiredAnomalies(): void {
        const now = Date.now()
        for (const network of this.store.listNetworks()) {
            for (const device of network.devices.values()) {
                if (
                    device.anomaly.active &&
                    device.anomaly.endsAt !== null &&
                    now >= device.anomaly.endsAt
                ) {
                    this.store.clearAnomaly(device.id)
                }
            }
        }
    }
}
