import { useMemo } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { LineChart as LineChartIcon } from "lucide-react"
import { cn } from "@/lib/cn"
import {
    formatKwh,
    formatCostBrl,
    formatReferenceDate,
} from "@/lib/formatters/consumption"
import type { DashboardTimeSeriesPoint } from "@/types/dashboard.types"
import type { ReportPeriod } from "@/types/report.types"

interface DashboardTimeSeriesChartProps {
    points: DashboardTimeSeriesPoint[]
    period: ReportPeriod
    isRefetching?: boolean
}

/**
 * Gráfico de série temporal — uma barra por referenceDate, somando o
 * consumo de TODAS as propriedades naquela fatia.
 *
 * Decisão de UX confirmada (Q1=C): Ranking + Série temporal coexistem.
 * Cada um responde a uma pergunta diferente:
 *   - Ranking responde "quem consome mais?"
 *   - Série temporal responde "como o consumo total evoluiu?"
 *
 * Como os points já chegam ordenados por referenceDate ASC vindos do
 * `aggregateTimeSeries`, o eixo X é monotônico — só formatamos a label
 * usando `formatReferenceDate(period)` que adapta DAILY (DD/MM), MONTHLY
 * (MMM/YY) e ANNUAL (YYYY) automaticamente. Mesma função do ReportChart.
 *
 * Empty state separado quando points está vazio — o user vê tudo zerado
 * e entende imediatamente que precisa ajustar o filtro.
 */

interface RechartsPayloadEntry {
    payload: DashboardTimeSeriesPoint & { label: string }
    value: number
    name: string
}

const isRechartsPayloadEntry = (v: unknown): v is RechartsPayloadEntry =>
    typeof v === "object" &&
    v !== null &&
    "payload" in v &&
    typeof (v as RechartsPayloadEntry).payload === "object"

interface ChartTooltipProps {
    active?: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any[]
}

const ChartTooltip = ({ active, payload }: ChartTooltipProps) => {
    if (!active || !Array.isArray(payload) || payload.length === 0) return null

    const entry = payload[0]
    if (!isRechartsPayloadEntry(entry)) return null

    const datum = entry.payload

    return (
        <div
            data-testid="dashboard-time-series-tooltip"
            className={cn(
                "rounded-md border bg-white px-3 py-2 text-xs shadow-md",
                "border-slate-200 dark:border-slate-700 dark:bg-slate-900",
            )}
        >
            <p className="font-medium text-slate-900 dark:text-slate-100">
                {datum.label}
            </p>
            <div className="mt-1 flex flex-col gap-0.5">
                <p className="text-slate-700 dark:text-slate-300">
                    <span className="font-mono tabular-nums">
                        {formatKwh(datum.totalKwh)}
                    </span>{" "}
                    <span className="text-slate-500">kWh</span>
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                    <span className="text-slate-500">Custo:</span>{" "}
                    <span className="font-mono tabular-nums">
                        {formatCostBrl(datum.totalCostBrl)}
                    </span>
                </p>
                <p className="text-slate-500">
                    Soma de {datum.propertyCount}{" "}
                    {datum.propertyCount === 1
                        ? "propriedade"
                        : "propriedades"}
                </p>
            </div>
        </div>
    )
}

export const DashboardTimeSeriesChart = ({
    points,
    period,
    isRefetching = false,
}: DashboardTimeSeriesChartProps) => {
    const data = useMemo(() => {
        return points.map((p) => ({
            ...p,
            label: formatReferenceDate(p.referenceDate, period),
        }))
    }, [points, period])

    if (data.length === 0) {
        return (
            <div
                data-testid="dashboard-time-series-empty"
                className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border p-8",
                    "border-slate-200 bg-white text-center",
                    "dark:border-slate-800 dark:bg-slate-950",
                )}
            >
                <LineChartIcon
                    className="h-6 w-6 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Sem dados de consumo no período
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cadastre registros de consumo nas propriedades ou amplie o
                    intervalo de datas.
                </p>
            </div>
        )
    }

    return (
        <div
            data-testid="dashboard-time-series-chart"
            className={cn(
                "flex flex-col gap-3 rounded-lg border p-4",
                "border-slate-200 bg-white",
                "dark:border-slate-800 dark:bg-slate-950",
                isRefetching && "opacity-70",
            )}
        >
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Evolução agregada no tempo
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {data.length}{" "}
                    {data.length === 1 ? "ponto" : "pontos"}
                </span>
            </div>

            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-slate-200 dark:stroke-slate-800"
                        />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11 }}
                            className="text-slate-600 dark:text-slate-400"
                        />
                        <YAxis
                            tick={{ fontSize: 11 }}
                            className="text-slate-600 dark:text-slate-400"
                            tickFormatter={(value: number) => formatKwh(value)}
                        />
                        <Tooltip
                            cursor={{ fill: "rgb(148 163 184 / 0.1)" }}
                            content={<ChartTooltip />}
                        />
                        <Bar
                            dataKey="totalKwh"
                            radius={[4, 4, 0, 0]}
                            className="fill-brand-500 dark:fill-brand-400"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}