import type { SimulationStore } from "@/simulation/store.js"
import type { InternalPublisher } from "@/mqtt/internalPublisher.js"
import { generateSample } from "@/simulation/signalGenerator.js"

const TICK_INTERVAL_MS = 1000

// Um setInterval por device ligado: gera uma amostra, publica no broker
// embutido e grava o resultado no store, ~1×/s.
export class DeviceRunner {
    private timer: NodeJS.Timeout | null = null
    private tickIndex = 0

    constructor(
        private readonly deviceId: string,
        private readonly store: SimulationStore,
        private readonly publisher: InternalPublisher,
    ) {}

    start(): void {
        if (this.timer) return
        this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

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
