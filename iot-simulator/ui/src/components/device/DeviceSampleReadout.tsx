import { Fragment } from "react"
import type { ElectricalSample } from "@/types"

interface DeviceSampleReadoutProps {
    sample: ElectricalSample
}

interface PhaseRow {
    label: string
    unit: string
    values: [number, number, number]
}

function buildPhaseRows(sample: ElectricalSample): PhaseRow[] {
    return [
        {
            label: "Tensão",
            unit: "V",
            values: [sample.voltagePhaseA, sample.voltagePhaseB, sample.voltagePhaseC],
        },
        {
            label: "Corrente",
            unit: "A",
            values: [sample.currentPhaseA, sample.currentPhaseB, sample.currentPhaseC],
        },
        {
            label: "Pot. ativa",
            unit: "W",
            values: [sample.activePowerPhaseA, sample.activePowerPhaseB, sample.activePowerPhaseC],
        },
        {
            label: "Fator pot.",
            unit: "",
            values: [sample.powerFactorPhaseA, sample.powerFactorPhaseB, sample.powerFactorPhaseC],
        },
        {
            label: "THD tensão",
            unit: "%",
            values: [sample.thdVoltagePhaseA, sample.thdVoltagePhaseB, sample.thdVoltagePhaseC],
        },
        {
            label: "THD corrente",
            unit: "%",
            values: [sample.thdCurrentPhaseA, sample.thdCurrentPhaseB, sample.thdCurrentPhaseC],
        },
    ]
}

function formatValue(value: number, unit: string): string {
    const decimals = unit === "" ? 3 : 2
    return `${value.toFixed(decimals)}${unit}`
}

/**
 * Leitura somente-exibição das grandezas por fase (ADR-0022) da amostra mais
 * recente de um device. Não há handoff de design para esta tabela — nenhum
 * export do bundle cobre a exibição de grandezas por fase no simulador —
 * então segue o mesmo padrão visual já usado no formulário de parâmetros do
 * próprio bundle (rótulo em caixa alta + grade), em vez de inventar um
 * layout novo.
 */
export function DeviceSampleReadout({ sample }: DeviceSampleReadoutProps) {
    const rows = buildPhaseRows(sample)

    return (
        <div>
            <span className="font-heading text-text/45 mb-2 block text-[10.5px] font-semibold tracking-[.06em] uppercase">
                Última amostra — por fase
            </span>
            <div className="grid grid-cols-[auto_repeat(3,1fr)] items-center gap-x-3 gap-y-1 text-[12.5px]">
                <span />
                <span className="text-text/45 text-center text-[11px]">A</span>
                <span className="text-text/45 text-center text-[11px]">B</span>
                <span className="text-text/45 text-center text-[11px]">C</span>
                {rows.map((row) => (
                    <Fragment key={row.label}>
                        <span className="text-text/60">{row.label}</span>
                        {row.values.map((value, index) => (
                            <span key={index} className="text-center font-medium">
                                {formatValue(value, row.unit)}
                            </span>
                        ))}
                    </Fragment>
                ))}
            </div>
            <div className="text-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                <span>Reativa: {formatValue(sample.reactivePowerVar, "var")}</span>
                <span>Aparente: {formatValue(sample.apparentPowerVa, "VA")}</span>
                <span>Frequência: {formatValue(sample.frequencyHz, "Hz")}</span>
            </div>
        </div>
    )
}
