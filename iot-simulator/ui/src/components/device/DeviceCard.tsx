import { useEffect, useState } from "react"
import { Button } from "@/components/ui/Button"
import { CopyButton } from "@/components/ui/CopyButton"
import { DeviceControls } from "@/components/device/DeviceControls"
import { AnomalyButton } from "@/components/device/AnomalyButton"
import type { DeviceParams, VirtualDevice } from "@/types"

interface DeviceCardProps {
    device: VirtualDevice
    onPowerToggle: (on: boolean) => void
    onDelete: () => void
    onSaveParams: (params: DeviceParams) => void
    onTriggerAnomaly: (multiplier: number, durationSeconds: number) => void
    onClearAnomaly: () => void
    isPowerPending?: boolean
    isSavePending?: boolean
    isAnomalyPending?: boolean
}

// Re-renderiza a cada segundo enquanto ligado, só para o "há Xs" do
// indicador de publicação ficar vivo sem esperar o próximo evento SSE.
function useTick(active: boolean): void {
    const [, setTick] = useState(0)
    useEffect(() => {
        if (!active) return
        const timer = setInterval(() => setTick((t) => t + 1), 1000)
        return () => clearInterval(timer)
    }, [active])
}

function secondsAgo(timestampMs: number): number {
    return Math.max(0, Math.round((Date.now() - timestampMs) / 1000))
}

export function DeviceCard({
    device,
    onPowerToggle,
    onDelete,
    onSaveParams,
    onTriggerAnomaly,
    onClearAnomaly,
    isPowerPending = false,
    isSavePending = false,
    isAnomalyPending = false,
}: DeviceCardProps) {
    useTick(device.poweredOn)
    const isPublishing = device.poweredOn && device.connected && device.lastPublishedAt !== null

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-medium">{device.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <code>{device.topic}</code>
                        <CopyButton value={device.topic} />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs">
                        <span
                            className={`h-2 w-2 rounded-full ${isPublishing ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`}
                            aria-hidden="true"
                        />
                        {isPublishing && device.lastPublishedAt !== null
                            ? `publicando — há ${secondsAgo(device.lastPublishedAt)}s`
                            : "desligado"}
                    </span>
                    <Button
                        variant={device.poweredOn ? "secondary" : "primary"}
                        size="sm"
                        isLoading={isPowerPending}
                        onClick={() => onPowerToggle(!device.poweredOn)}
                    >
                        {device.poweredOn ? "Desligar" : "Ligar"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onDelete}>
                        Remover
                    </Button>
                </div>
            </div>

            <DeviceControls params={device.params} onSave={onSaveParams} isPending={isSavePending} />

            <AnomalyButton
                anomaly={device.anomaly}
                onTrigger={onTriggerAnomaly}
                onClear={onClearAnomaly}
                isPending={isAnomalyPending}
            />
        </div>
    )
}
