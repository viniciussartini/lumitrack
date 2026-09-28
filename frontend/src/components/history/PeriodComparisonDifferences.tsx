import { Blueprint } from "@/components/ui/Blueprint"
import { getSeriesMetricDefinition } from "@/lib/meterReadingSeries"
import type { PeriodComparisonRun } from "@/lib/periodComparison"
import { buildComparisonStats, buildComparisonVariation } from "@/lib/periodComparisonDiff"
import type { MeterReadingComparePeriodsResponse } from "@/types/meterReadingSeries.types"

interface PeriodComparisonDifferencesProps {
    run: PeriodComparisonRun
    data: MeterReadingComparePeriodsResponse
}

const LABEL_CLASS =
    "font-heading text-muted text-11 leading-none font-semibold tracking-[.08em] uppercase"

/**
 * Seção "Diferenças" do Histórico (LumiTrack Home v2.dc.html, bloco
 * `cmpStats`): a variação de B sobre A em destaque e os cards de média,
 * diferença absoluta, pico e dias de cada período. O sinal e a nota dizem a
 * direção da variação — a cor sozinha não carrega a informação.
 */
export const PeriodComparisonDifferences = ({ run, data }: PeriodComparisonDifferencesProps) => {
    const metric = getSeriesMetricDefinition(run.metric)
    const variation = buildComparisonVariation(data.diff)
    const stats = buildComparisonStats(run, data, metric.format)

    return (
        <Blueprint className="p-0" data-testid="period-comparison-differences">
            <div className="border-divider border-b px-5 py-4">
                <span className="font-heading text-17 font-semibold uppercase">Diferenças</span>
                <span className="text-muted mt-0.5 block text-xs">
                    {run.target.label} · {metric.label}
                </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                <div className="flex flex-col gap-1.5 p-5">
                    <span className={LABEL_CLASS}>Variação B sobre A</span>
                    <span
                        data-testid="period-variation"
                        className={`font-heading text-34 font-features-['tnum'_1] leading-none font-semibold ${variation.toneClass}`}
                    >
                        {variation.text}
                    </span>
                    <span className="text-muted text-13">{variation.note}</span>
                </div>
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className="border-divider flex flex-col gap-2 border-l p-5"
                    >
                        <span className={LABEL_CLASS}>{stat.label}</span>
                        <span className="font-heading text-22 font-features-['tnum'_1] leading-none font-semibold">
                            {stat.value}
                        </span>
                    </div>
                ))}
            </div>
        </Blueprint>
    )
}
