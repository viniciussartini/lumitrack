import { formatKwh, formatCostBrl } from "@/lib/formatters/consumption"
import type { ConsumptionBucket } from "@/types/consumption.types"

export interface ComparisonRow {
    id: string
    label: string
    bucket: ConsumptionBucket
}

interface ComparisonBarsProps {
    rows: ComparisonRow[]
    unit: "kwh" | "reais"
}

/**
 * Barras horizontais de comparação de consumo mensal — usado tanto em
 * "Comparação de áreas" (PropertyDetailsPage) quanto "Comparação de
 * dispositivos" (AreaDetailsPage), mesma lógica de proporção ao máximo.
 */
export const ComparisonBars = ({ rows, unit }: ComparisonBarsProps) => {
    const values = rows.map((row) =>
        unit === "reais" ? row.bucket.costBrl : row.bucket.kwhConsumed,
    )
    const max = Math.max(...values, 1)

    return (
        <div className="flex flex-col">
            {rows.map((row, i) => {
                const value = values[i]!
                const pct = (value / max) * 100
                return (
                    <div key={row.id} className="border-divider border-b py-3 last:border-b-0">
                        <div className="mb-[7px] flex items-baseline justify-between">
                            <span className="text-[13.5px]">{row.label}</span>
                            <span className="font-heading text-[17px] font-semibold font-features-['tnum'_1]">
                                {unit === "reais" ? formatCostBrl(value) : `${formatKwh(value)} kWh`}
                            </span>
                        </div>
                        <div className="bg-divider h-2.5">
                            <div
                                className="h-full"
                                style={{
                                    width: `${pct}%`,
                                    background: unit === "reais" ? "#d98a1e" : "#5980a6",
                                }}
                            />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
