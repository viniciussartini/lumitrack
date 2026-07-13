import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { DEVICE_PROFILES, type DeviceParams } from "@/types"

interface DeviceControlsProps {
    params: DeviceParams
    onSave: (params: DeviceParams) => void
    isPending?: boolean
}

const PROFILE_LABELS: Record<DeviceParams["profile"], string> = {
    RESIDENTIAL_STEADY: "Residencial estável",
    COMMERCIAL_HVAC: "Comercial (HVAC)",
    INDUSTRIAL_MOTOR: "Industrial (motor)",
    CUSTOM: "Customizado",
}

// Estado local iniciado a partir de `params` e nunca ressincronizado por
// efeito — o pai (DeviceCard) já é montado com `key={device.id}`, então
// trocar de device naturalmente remonta este componente com estado limpo.
// Sem isso, edições em andamento seriam sobrescritas a cada ~1s pelas
// amostras chegando via SSE do device ligado.
export function DeviceControls({ params, onSave, isPending = false }: DeviceControlsProps) {
    const [form, setForm] = useState(params)

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input
                label="Tensão nominal (V)"
                type="number"
                value={form.nominalVoltage}
                onChange={(e) => setForm({ ...form, nominalVoltage: Number(e.target.value) })}
            />
            <Input
                label="Potência nominal (W)"
                type="number"
                value={form.nominalPowerW}
                onChange={(e) => setForm({ ...form, nominalPowerW: Number(e.target.value) })}
            />
            <Input
                label="Fator de potência"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={form.powerFactorBase}
                onChange={(e) => setForm({ ...form, powerFactorBase: Number(e.target.value) })}
            />
            <Input
                label="Ruído (%)"
                type="number"
                min={0}
                max={100}
                value={form.noiseAmplitudePercent}
                onChange={(e) => setForm({ ...form, noiseAmplitudePercent: Number(e.target.value) })}
            />
            <Select
                label="Perfil"
                className="col-span-2"
                value={form.profile}
                onChange={(e) => setForm({ ...form, profile: e.target.value as DeviceParams["profile"] })}
            >
                {DEVICE_PROFILES.map((profile) => (
                    <option key={profile} value={profile}>
                        {PROFILE_LABELS[profile]}
                    </option>
                ))}
            </Select>
            <div className="col-span-2 flex items-end">
                <Button variant="secondary" size="sm" isLoading={isPending} onClick={() => onSave(form)}>
                    Salvar parâmetros
                </Button>
            </div>
        </div>
    )
}
