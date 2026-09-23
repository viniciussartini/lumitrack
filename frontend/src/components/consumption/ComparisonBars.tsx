import { formatKwh, formatCostBrl } from "@/lib/formatters/consumption"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"

export interface ComparisonRow {
    id: string
    label: string
    bucket: ConsumptionSummaryItem
}

interface ComparisonBarsProps {
    rows: ComparisonRow[]
    unit: "kwh" | "reais"
}

/**
 * Barras horizontais de comparação de consumo mensal, proporcionais ao maior
 * valor. Em R$, as linhas sem custo calculável ficam de fora — não são
 * desenhadas como zero.
 */
export const ComparisonBars = ({ rows, unit }: ComparisonBarsProps) => {
    const bars = rows.flatMap((row) => {
        const value = unit === "reais" ? row.bucket.costBrl : row.bucket.kwhConsumed
        return value === undefined ? [] : [{ id: row.id, label: row.label, value }]
    })
    const max = Math.max(...bars.map((bar) => bar.value), 1)

    return (
        <div className="flex flex-col">
            {bars.map((bar) => (
                <div key={bar.id} className="border-divider border-b py-3 last:border-b-0">
                    <div className="mb-[7px] flex items-baseline justify-between">
                        <span className="text-13-5">{bar.label}</span>
                        <span className="font-heading text-17 font-features-['tnum'_1] font-semibold">
                            {unit === "reais"
                                ? formatCostBrl(bar.value)
                                : `${formatKwh(bar.value)} kWh`}
                        </span>
                    </div>
                    <div className="bg-divider h-2.5">
                        <div
                            className="h-full"
                            style={{
                                width: `${(bar.value / max) * 100}%`,
                                backgroundColor:
                                    unit === "reais"
                                        ? "var(--color-chart-amber)"
                                        : "var(--color-chart-blue)",
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}
