import { Blueprint } from "@/components/ui/Blueprint"
import {
    PERIOD_A_COLOR,
    PERIOD_B_COLOR,
    PeriodComparisonChart,
} from "@/components/history/PeriodComparisonChart"
import { getSeriesMetricDefinition } from "@/lib/meterReadingSeries"
import type { PeriodComparisonRun } from "@/lib/periodComparison"
import {
    buildComparisonChartPoints,
    formatComparisonPeriodLabel,
} from "@/lib/periodComparisonChart"
import type { MeterReadingComparePeriodsResponse } from "@/types/meterReadingSeries.types"

interface PeriodComparisonChartCardProps {
    run: PeriodComparisonRun
    data: MeterReadingComparePeriodsResponse
}

/**
 * Cartão do gráfico comparativo (LumiTrack Home v2.dc.html, bloco
 * `cmpChart`): alvo e grandeza no cabeçalho, legenda A/B com as cores das
 * séries e o gráfico. A legenda leva as datas de cada período, porque o eixo
 * X é por posição de balde e não mostra datas.
 */
export const PeriodComparisonChartCard = ({ run, data }: PeriodComparisonChartCardProps) => {
    const metric = getSeriesMetricDefinition(run.metric)

    return (
        <Blueprint className="p-0">
            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                    <span className="font-heading text-17 font-semibold uppercase">
                        {run.target.label}
                    </span>
                    <span className="text-muted mt-0.5 block text-xs">{metric.label}</span>
                </div>
                <ul className="m-0 flex list-none gap-3.5 p-0">
                    <LegendItem
                        color={PERIOD_A_COLOR}
                        label={formatComparisonPeriodLabel("A", run.aStart, run.aEnd)}
                    />
                    <LegendItem
                        color={PERIOD_B_COLOR}
                        label={formatComparisonPeriodLabel("B", run.bStart, run.bEnd)}
                    />
                </ul>
            </div>
            <div className="p-5">
                <PeriodComparisonChart
                    points={buildComparisonChartPoints(run, data)}
                    format={metric.format}
                />
            </div>
        </Blueprint>
    )
}

interface LegendItemProps {
    color: string
    label: string
}

const LegendItem = ({ color, label }: LegendItemProps) => (
    <li className="text-12 inline-flex items-center gap-2">
        <span aria-hidden="true" className="h-3 w-3" style={{ backgroundColor: color }} />
        {label}
    </li>
)
