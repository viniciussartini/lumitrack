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
import { Building2 } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatKwh, formatCostBrl } from "@/lib/formatters/consumption"
import {
    REPORT_TREND_LABELS,
} from "@/lib/formatters/report"
import type { DashboardPropertyEntry } from "@/types/dashboard.types"
import type { ReportTrend } from "@/types/report.types"

interface DashboardPropertiesChartProps {
    entries: DashboardPropertyEntry[]
    isRefetching?: boolean
}

/**
 * Gráfico de ranking — uma barra por propriedade, ordenado por kWh desc.
 *
 * Decisão de design confirmada com user (Q1=C): mostra ranking comparativo
 * para responder "qual propriedade consome mais?" — caso de uso primário
 * do dashboard.
 *
 * Filtragem: só inclui entries com status="success" e recordCount > 0.
 * Propriedades sem dados no período não tem o que representar como barra.
 * As propriedades em erro também ficam fora — quem precisa ver erro abre
 * a tabela abaixo, que exibe ambos os casos.
 *
 * Truncamento do label do eixo X:
 *   Nomes longos no eixo X em screen pequena viram bagunça. Truncamos em
 *   15 chars com reticências e mostramos o nome completo no tooltip. O
 *   tooltip é interativo, então não há perda informacional.
 *
 * Tooltip custom:
 *   Mesma estratégia do ReportChart — Recharts v3 mudou os tipos genéricos
 *   do Tooltip, então fazemos narrowing manual do payload (isRechartsPayloadEntry).
 */

interface ChartDatum {
    label: string
    fullName: string
    kwh: number
    cost: number
    trend: ReportTrend
    propertyId: string
}

interface RechartsPayloadEntry {
    payload: ChartDatum
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
            data-testid="dashboard-properties-chart-tooltip"
            className={cn(
                "rounded-md border bg-white px-3 py-2 text-xs shadow-md",
                "border-slate-200 dark:border-slate-700 dark:bg-slate-900",
            )}
        >
            <p className="font-medium text-slate-900 dark:text-slate-100">
                {datum.fullName}
            </p>
            <div className="mt-1 flex flex-col gap-0.5">
                <p className="text-slate-700 dark:text-slate-300">
                    <span className="font-mono tabular-nums">
                        {formatKwh(datum.kwh)}
                    </span>{" "}
                    <span className="text-slate-500">kWh</span>
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                    <span className="text-slate-500">Custo:</span>{" "}
                    <span className="font-mono tabular-nums">
                        {formatCostBrl(datum.cost)}
                    </span>
                </p>
                <p className="text-slate-500">
                    Tendência: {REPORT_TREND_LABELS[datum.trend]}
                </p>
            </div>
        </div>
    )
}

const truncate = (name: string, max = 15): string =>
    name.length <= max ? name : `${name.slice(0, max - 1)}…`

export const DashboardPropertiesChart = ({
    entries,
    isRefetching = false,
}: DashboardPropertiesChartProps) => {
    const data = useMemo<ChartDatum[]>(() => {
        return entries
            .filter(
                (e) =>
                    e.status === "success" &&
                    e.result !== null &&
                    e.result.summary.recordCount > 0,
            )
            .map((e) => ({
                label: truncate(e.propertyName),
                fullName: e.propertyName,
                kwh: e.result!.summary.totalKwh,
                cost: e.result!.summary.totalCostBrl,
                trend: e.result!.summary.trend,
                propertyId: e.propertyId,
            }))
    }, [entries])

    if (data.length === 0) {
        return (
            <div
                data-testid="dashboard-properties-chart-empty"
                className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border p-8",
                    "border-slate-200 bg-white text-center",
                    "dark:border-slate-800 dark:bg-slate-950",
                )}
            >
                <Building2
                    className="h-6 w-6 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Sem propriedades com dados no período
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ajuste o filtro de data ou cadastre registros de consumo.
                </p>
            </div>
        )
    }

    return (
        <div
            data-testid="dashboard-properties-chart"
            className={cn(
                "flex flex-col gap-3 rounded-lg border p-4",
                "border-slate-200 bg-white",
                "dark:border-slate-800 dark:bg-slate-950",
                isRefetching && "opacity-70",
            )}
        >
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Ranking por propriedade
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {data.length}{" "}
                    {data.length === 1 ? "propriedade" : "propriedades"}
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
                            interval={0}
                            angle={-15}
                            textAnchor="end"
                            height={50}
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
                            dataKey="kwh"
                            radius={[4, 4, 0, 0]}
                            className="fill-brand-500 dark:fill-brand-400"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}