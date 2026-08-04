import { Input } from "@/components/ui/Input"
import type { DeviceParams } from "@/types"

interface DeviceParamsFieldsProps {
    params: DeviceParams
    onChange: (params: DeviceParams) => void
}

/**
 * Os 4 campos numéricos de parâmetros elétricos — compartilhados entre
 * `DeviceControls` (editar device existente) e o modal "Adicionar
 * dispositivo" (criar), que usam o mesmo conjunto de campos em layouts
 * ligeiramente diferentes (o Select de Perfil fica fora daqui de propósito,
 * cada consumidor o posiciona à sua maneira — ver handoff).
 */
export const DeviceParamsFields = ({ params, onChange }: DeviceParamsFieldsProps) => (
    <>
        <Input
            label="Tensão (V)"
            type="number"
            value={params.nominalVoltage}
            onChange={(e) => onChange({ ...params, nominalVoltage: Number(e.target.value) })}
        />
        <Input
            label="Potência (W)"
            type="number"
            value={params.nominalPowerW}
            onChange={(e) => onChange({ ...params, nominalPowerW: Number(e.target.value) })}
        />
        <Input
            label="Fator pot."
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={params.powerFactorBase}
            onChange={(e) => onChange({ ...params, powerFactorBase: Number(e.target.value) })}
        />
        <Input
            label="Ruído (%)"
            type="number"
            min={0}
            max={100}
            value={params.noiseAmplitudePercent}
            onChange={(e) => onChange({ ...params, noiseAmplitudePercent: Number(e.target.value) })}
        />
    </>
)
