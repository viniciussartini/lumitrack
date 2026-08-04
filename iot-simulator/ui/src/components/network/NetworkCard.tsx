import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { DeviceParamsFields } from "@/components/device/DeviceParamsFields"
import { DeviceCard } from "@/components/device/DeviceCard"
import { ChevronDownIcon, PlusIcon } from "@/components/ui/icons"
import { useNetworks } from "@/hooks/useNetworks"
import { DEVICE_PROFILES, type DeviceParams, type NetworkSnapshot } from "@/types"

interface NetworkCardProps {
    network: NetworkSnapshot
}

const PROFILE_LABELS: Record<DeviceParams["profile"], string> = {
    RESIDENTIAL_STEADY: "Residencial estável",
    COMMERCIAL_HVAC: "Comercial (HVAC)",
    INDUSTRIAL_MOTOR: "Industrial (motor)",
    CUSTOM: "Customizado",
}

const DEFAULT_DEVICE_PARAMS: DeviceParams = {
    nominalVoltage: 220,
    nominalPowerW: 1000,
    powerFactorBase: 0.92,
    noiseAmplitudePercent: 5,
    profile: "RESIDENTIAL_STEADY",
}

/** Ferramenta de desenvolvimento local — a rede agrupa medidores virtuais
 * que publicam no mesmo broker (LumiTrack IoT Simulator.dc.html). */
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

    const [open, setOpen] = useState(true)
    const [showDeviceModal, setShowDeviceModal] = useState(false)
    const [deviceName, setDeviceName] = useState("")
    const [deviceTopic, setDeviceTopic] = useState("")
    const [deviceParams, setDeviceParams] = useState<DeviceParams>(DEFAULT_DEVICE_PARAMS)

    function closeDeviceModal() {
        setShowDeviceModal(false)
        setDeviceName("")
        setDeviceTopic("")
        setDeviceParams(DEFAULT_DEVICE_PARAMS)
    }

    function handleCreateDevice(e: FormEvent) {
        e.preventDefault()
        if (!deviceName.trim() || !deviceTopic.trim()) return
        createDevice.mutate(
            { networkId: network.id, name: deviceName.trim(), topic: deviceTopic.trim(), params: deviceParams },
            { onSuccess: closeDeviceModal },
        )
    }

    const deviceCountLabel = `${network.devices.length} ${network.devices.length === 1 ? "dispositivo" : "dispositivos"}`

    return (
        <>
            <details
                className="blueprint"
                open={open}
                onToggle={(e) => setOpen(e.currentTarget.open)}
            >
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <ChevronDownIcon
                            className={`text-text/45 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
                        />
                        <span className="font-heading truncate text-lg font-semibold">{network.name}</span>
                        <span className="text-text/52 shrink-0 text-[13px]">({deviceCountLabel})</span>
                    </div>
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

                <div className="border-divider flex flex-col gap-3.5 border-t px-5 py-4">
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

                    {network.devices.length === 0 && (
                        <p className="text-text/55 px-0.5 text-[13px]">Nenhum dispositivo nesta rede ainda.</p>
                    )}

                    <div className="border-divider border-t border-dashed pt-3.5">
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<PlusIcon width={15} height={15} />}
                            onClick={() => setShowDeviceModal(true)}
                        >
                            Adicionar dispositivo
                        </Button>
                    </div>
                </div>
            </details>

            {showDeviceModal && (
                <Modal
                    eyebrow={`Novo dispositivo em ${network.name}`}
                    title="Adicionar dispositivo"
                    onClose={closeDeviceModal}
                    onSubmit={handleCreateDevice}
                    className="max-w-[560px]"
                    footer={
                        <>
                            <Button type="button" variant="ghost" onClick={closeDeviceModal}>
                                Cancelar
                            </Button>
                            <Button type="submit" variant="secondary" isLoading={createDevice.isPending}>
                                Adicionar dispositivo
                            </Button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4.5">
                        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                            <Input
                                label="Nome do dispositivo"
                                value={deviceName}
                                onChange={(e) => setDeviceName(e.target.value)}
                                placeholder="Medidor 1"
                                autoComplete="off"
                                autoFocus
                            />
                            <Input
                                label="Tópico MQTT"
                                value={deviceTopic}
                                onChange={(e) => setDeviceTopic(e.target.value)}
                                placeholder="lumitrack/sim/dev1"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <span className="font-heading text-text/45 mb-2.5 block text-[10.5px] font-semibold tracking-[.06em] uppercase">
                                Parâmetros iniciais
                            </span>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <DeviceParamsFields params={deviceParams} onChange={setDeviceParams} />
                            </div>
                            <Select
                                label="Perfil"
                                className="mt-3"
                                value={deviceParams.profile}
                                onChange={(e) =>
                                    setDeviceParams({
                                        ...deviceParams,
                                        profile: e.target.value as DeviceParams["profile"],
                                    })
                                }
                            >
                                {DEVICE_PROFILES.map((profile) => (
                                    <option key={profile} value={profile}>
                                        {PROFILE_LABELS[profile]}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    )
}
