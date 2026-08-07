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

function PublishingStatus({
    isPublishing,
    lastPublishedAt,
}: {
    isPublishing: boolean
    lastPublishedAt: number | null
}) {
    return (
        <span className="text-text/70 inline-flex items-center gap-1.5 text-xs">
            <span
                className={`h-2 w-2 rounded-full ${isPublishing ? "bg-[#3f8f52]" : "bg-neutral-100"}`}
                style={
                    isPublishing ? { animation: "lt-pulse 1.6s ease-in-out infinite" } : undefined
                }
                aria-hidden="true"
            />
            {isPublishing && lastPublishedAt !== null
                ? `publicando — há ${secondsAgo(lastPublishedAt)}s`
                : "desligado"}
        </span>
    )
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
        <div className="border-divider flex flex-col gap-3.5 border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0">
                    <h3 className="font-heading text-[15.5px] font-semibold">{device.name}</h3>
                    <div className="mt-0.5 flex items-center gap-1.5">
                        <code className="text-muted text-[12.5px]">{device.topic}</code>
                        <CopyButton value={device.topic} label="Copiar tópico" />
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <PublishingStatus
                        isPublishing={isPublishing}
                        lastPublishedAt={device.lastPublishedAt}
                    />
                    <Button
                        variant={device.poweredOn ? "secondary" : "primary"}
                        size="sm"
                        className="min-w-[92px]"
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

            <DeviceControls
                params={device.params}
                onSave={onSaveParams}
                isPending={isSavePending}
            />

            <AnomalyButton
                anomaly={device.anomaly}
                onTrigger={onTriggerAnomaly}
                onClear={onClearAnomaly}
                isPending={isAnomalyPending}
            />
        </div>
    )
}
