import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { DeviceCard } from "@/components/device/DeviceCard"
import { useNetworks } from "@/hooks/useNetworks"
import type { NetworkSnapshot } from "@/types"

interface NetworkCardProps {
    network: NetworkSnapshot
}

export function NetworkCard({ network }: NetworkCardProps) {
    const {
        deleteNetwork,
        createDevice,
        updateDevice,
        deleteDevice,
        setPower,
        triggerAnomaly,
        clearAnomaly,
    } = useNetworks()

    const [deviceName, setDeviceName] = useState("")
    const [deviceTopic, setDeviceTopic] = useState("")

    function handleCreateDevice(e: FormEvent) {
        e.preventDefault()
        if (!deviceName.trim() || !deviceTopic.trim()) return
        createDevice.mutate(
            { networkId: network.id, name: deviceName.trim(), topic: deviceTopic.trim() },
            { onSuccess: () => { setDeviceName(""); setDeviceTopic("") } },
        )
    }

    return (
        <details className="rounded-lg border border-slate-200 dark:border-slate-800" open>
            <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-lg font-semibold">
                <span>
                    {network.name} <span className="text-sm font-normal text-slate-500">({network.devices.length} dispositivos)</span>
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    isLoading={deleteNetwork.isPending}
                    onClick={(e) => {
                        e.preventDefault()
                        deleteNetwork.mutate(network.id)
                    }}
                >
                    Remover rede
                </Button>
            </summary>

            <div className="flex flex-col gap-3 border-t border-slate-200 p-4 dark:border-slate-800">
                {network.devices.map((device) => (
                    <DeviceCard
                        key={device.id}
                        device={device}
                        onPowerToggle={(on) => setPower.mutate({ id: device.id, on })}
                        onDelete={() => deleteDevice.mutate(device.id)}
                        onSaveParams={(params) => updateDevice.mutate({ id: device.id, patch: { params } })}
                        onTriggerAnomaly={(multiplier, durationSeconds) =>
                            triggerAnomaly.mutate({ id: device.id, multiplier, durationSeconds })
                        }
                        onClearAnomaly={() => clearAnomaly.mutate(device.id)}
                        isPowerPending={setPower.isPending}
                        isSavePending={updateDevice.isPending}
                        isAnomalyPending={triggerAnomaly.isPending || clearAnomaly.isPending}
                    />
                ))}

                <form onSubmit={handleCreateDevice} className="flex flex-wrap items-end gap-2">
                    <Input
                        label="Nome do dispositivo"
                        value={deviceName}
                        onChange={(e) => setDeviceName(e.target.value)}
                        placeholder="Medidor 1"
                    />
                    <Input
                        label="Tópico MQTT"
                        value={deviceTopic}
                        onChange={(e) => setDeviceTopic(e.target.value)}
                        placeholder="lumitrack/sim/dev1"
                    />
                    <Button type="submit" size="sm" isLoading={createDevice.isPending}>
                        Adicionar dispositivo
                    </Button>
                </form>
            </div>
        </details>
    )
}
