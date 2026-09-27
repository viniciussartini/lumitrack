import { SeriesLineChart } from "@/components/analysis/SeriesLineChart"
import {
    buildSeriesChartPoints,
    buildSeriesTableRows,
    formatSeriesRunLabel,
    getSeriesMetricDefinition,
    type SeriesRun,
} from "@/lib/meterReadingSeries"
import type { MeterReadingSeriesBucket } from "@/types/meterReadingSeries.types"

interface SeriesAnalysisResultsProps {
    run: SeriesRun
    items: MeterReadingSeriesBucket[]
}

/**
 * Resultado de uma consulta já executada da área de análise: legenda
 * (grandeza + janela), gráfico de linha e a tabela Mínimo/Média/Máximo —
 * extraído de `SeriesAnalysisSection` só para manter a complexidade da
 * seção dentro do teto do lint.
 */
export const SeriesAnalysisResults = ({ run, items }: SeriesAnalysisResultsProps) => {
    const metricDefinition = getSeriesMetricDefinition(run.metric)
    const timeHeader = run.window === "dia" ? "Hora" : "Horário"
    const rows = buildSeriesTableRows(run, items)

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3.5">
                <span className="font-heading text-15 font-semibold uppercase">
                    {metricDefinition.label}
                </span>
                <span className="text-muted text-12-5">{formatSeriesRunLabel(run)}</span>
            </div>

            <div className="px-5 py-3.5">
                <SeriesLineChart
                    points={buildSeriesChartPoints(run, items)}
                    format={metricDefinition.format}
                />
            </div>

            <div className="border-divider overflow-x-auto border-t">
                <table
                    className="w-full border-collapse text-sm"
                    data-testid="series-analysis-table"
                >
                    <thead className="bg-surface">
                        <tr className="text-muted text-left text-xs tracking-wide uppercase">
                            <th scope="col" className="px-4 py-3 font-medium">
                                {timeHeader}
                            </th>
                            <th scope="col" className="px-4 py-3 text-right font-medium">
                                Mínimo
                            </th>
                            <th scope="col" className="px-4 py-3 text-right font-medium">
                                Média
                            </th>
                            <th scope="col" className="px-4 py-3 text-right font-medium">
                                Máximo
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-divider divide-y">
                        {rows.map((row) => (
                            <tr key={row.label} className="text-text">
                                <td className="px-4 py-3 whitespace-nowrap">{row.label}</td>
                                <td className="px-4 py-3 text-right font-mono tabular-nums">
                                    {row.min}
                                </td>
                                <td className="px-4 py-3 text-right font-mono tabular-nums">
                                    {row.avg}
                                </td>
                                <td className="px-4 py-3 text-right font-mono tabular-nums">
                                    {row.max}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}
