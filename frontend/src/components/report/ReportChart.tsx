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
import { BarChart3 } from "lucide-react"
import { cn } from "@/lib/cn"
import {
    formatKwh,
    formatCostBrl,
    formatReferenceDate,
} from "@/lib/formatters/consumption"
import type { ConsumptionRecord } from "@/types/consumption.types"

interface ReportChartProps {
    records: ConsumptionRecord[]
    isRefetching?: boolean
}

interface ChartDatum {
    label: string
    kwh: number
    cost: number | null
    period: ConsumptionRecord["period"]
    referenceDate: string
}

/**
 * Tooltip custom do chart.
 *
 * Recharts v3 não expõe `payload` em `TooltipProps<number, string>` —
 * o tipo interno mudou. Solução idiomática: aceitar `unknown` e narrowar
 * para o shape do payload em runtime em vez de confiar no tipo genérico.
 *
 * O shape do payload do Recharts é um array de entradas, cada uma com:
 *   { payload: ChartDatum, value: number, name: string, ... }
 * Fazemos o narrow manualmente (isChartPayload).
 */
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

// O Recharts injeta estas props no componente de tooltip via render prop.
// Definimos o shape mínimo que precisamos — evita importar tipos internos
// que mudaram entre versões.
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
            data-testid="report-chart-tooltip"
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
            </div>
        </div>
    )
}

export const ReportChart = ({
    records,
    isRefetching = false,
}: ReportChartProps) => {
    const data: ChartDatum[] = useMemo(
        () =>
            records.map((record) => ({
                label: formatReferenceDate(record.referenceDate, record.period),
                kwh: record.kwhConsumed,
                cost: record.costBrl,
                period: record.period,
                referenceDate: record.referenceDate,
            })),
        [records],
    )

    if (records.length === 0) {
        return (
            <div
                data-testid="report-chart-empty"
                className={cn(
                    "flex h-80 items-center justify-center rounded-lg border",
                    "border-dashed border-slate-300 bg-slate-50",
                    "dark:border-slate-700 dark:bg-slate-900/50",
                )}
            >
                <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                    <BarChart3 className="h-6 w-6" aria-hidden="true" />
                    <p className="text-sm">Sem dados para o gráfico</p>
                </div>
            </div>
        )
    }

    return (
        <div
            data-testid="report-chart"
            className={cn(
                "rounded-lg border bg-white p-4 transition-opacity",
                "border-slate-200 dark:border-slate-800 dark:bg-slate-950",
                isRefetching && "opacity-60",
            )}
        >
            <ResponsiveContainer width="100%" height={320}>
                <BarChart
                    data={data}
                    margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                >
                    <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-slate-200 dark:stroke-slate-800"
                    />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12 }}
                        className="fill-slate-600 dark:fill-slate-400"
                        angle={-30}
                        textAnchor="end"
                        height={70}
                        interval={0}
                    />
                    <YAxis
                        tick={{ fontSize: 12 }}
                        className="fill-slate-600 dark:fill-slate-400"
                        tickFormatter={(value) => `${value} kWh`}
                        width={70}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                        dataKey="kwh"
                        fill="var(--color-brand-500, oklch(0.65 0.18 250))"
                        radius={[4, 4, 0, 0]}
                        name="kWh"
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}