import type { SimulationStore } from "@/simulation/store.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"
import { generateSample } from "@/simulation/signalGenerator.js"

const TICK_INTERVAL_MS = 1000

/**
 * Um `setInterval` por device ligado: gera uma amostra, publica no broker
 * embutido e grava o resultado no store, ~1×/s.
 */
export class DeviceRunner {
    private timer: NodeJS.Timeout | null = null
    private tickIndex = 0

    /**
     * @param deviceId Id do device simulado por este runner.
     * @param store Store da simulação (leitura do device, gravação da amostra).
     * @param publisher Cliente MQTT usado para publicar cada amostra.
     */
    constructor(
        private readonly deviceId: string,
        private readonly store: SimulationStore,
        private readonly publisher: InternalPublisher,
    ) {}

    /** Inicia o tick periódico, se ainda não estiver rodando. */
    start(): void {
        if (this.timer) return
        this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS)
    }

    /** Para o tick periódico, se estiver rodando. */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    /** @returns `true` se o tick periódico está ativo. */
    isRunning(): boolean {
        return this.timer !== null
    }

    private tick(): void {
        const device = this.store.getDevice(this.deviceId)
        // Device removido ou desligado por fora (ex.: via API) desde o
        // último tick — auto-stop defensivo, sem depender de quem desligou
        // também chamar stop() neste runner.
        if (!device || !device.poweredOn) {
            this.stop()
            return
        }

        const sample = generateSample(device.params, device.anomaly, this.tickIndex++)
        this.publisher.publish(device.topic, {
            ...sample,
            deviceTimestamp: new Date().toISOString(),
        })
        this.store.recordSample(this.deviceId, sample, Date.now())
    }
}
