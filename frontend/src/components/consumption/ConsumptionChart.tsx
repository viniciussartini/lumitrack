import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { BarChart3 } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatKwh, formatCostBrl, formatBucketLabel } from "@/lib/formatters/consumption"
import type { BucketSize, ConsumptionBucket } from "@/types/consumption.types"

interface ConsumptionChartProps {
    buckets: ConsumptionBucket[]
    bucketSize: BucketSize
    isRefetching?: boolean
}

interface ChartDatum {
    label: string
    kwh: number
    cost: number
}

/**
 * Tooltip custom do chart — mesmo padrão do antigo `ReportChart`: Recharts
 * v3 não expõe `payload` tipado, então narrowamos manualmente em runtime.
 */
interface RechartsPayloadEntry {
    payload: ChartDatum
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
            data-testid="consumption-chart-tooltip"
            className="border-divider bg-surface rounded-md border px-3 py-2 text-xs shadow-md"
        >
            <p className="text-text font-medium">{datum.label}</p>
            <div className="mt-1 flex flex-col gap-0.5">
                <p className="text-text/80">
                    <span className="font-mono tabular-nums">{formatKwh(datum.kwh)}</span>{" "}
                    <span className="text-muted">kWh</span>
                </p>
                <p className="text-text/80">
                    <span className="text-muted">Custo:</span>{" "}
                    <span className="font-mono tabular-nums">{formatCostBrl(datum.cost)}</span>
                </p>
            </div>
        </div>
    )
}

/**
 * Gráfico de consumo agregado — recharts BarChart, mesmo padrão visual do
 * antigo `ReportChart`, adaptado ao bucket `{bucketStart, kwhConsumed, costBrl}`
 * retornado por `GET /api/consumption`.
 *
 * Plota na ordem recebida: quem consulta uma janela já pede `order: "asc"`, e
 * quem pede "os últimos N buckets" (DESC) inverte antes de passar.
 */
export const ConsumptionChart = ({
    buckets,
    bucketSize,
    isRefetching = false,
}: ConsumptionChartProps) => {
    const data: ChartDatum[] = useMemo(
        () =>
            buckets.map((bucket) => ({
                label: formatBucketLabel(bucket.bucketStart, bucketSize),
                kwh: bucket.kwhConsumed,
                cost: bucket.costBrl,
            })),
        [buckets, bucketSize],
    )

    if (buckets.length === 0) {
        return (
            <div
                data-testid="consumption-chart-empty"
                className="border-divider bg-surface flex h-80 items-center justify-center rounded-lg border border-dashed"
            >
                <div className="text-muted flex flex-col items-center gap-2">
                    <BarChart3 className="h-6 w-6" aria-hidden="true" />
                    <p className="text-sm">Sem dados para o gráfico</p>
                </div>
            </div>
        )
    }

    // Sem borda/fundo próprios: os dois consumidores (ConsumptionSection,
    // ConsumptionHistorySection) já envolvem este componente num `.blueprint`
    // — uma segunda moldura aqui dentro seria borda dupla, não um cartão novo.
    return (
        <div
            data-testid="consumption-chart"
            className={cn("transition-opacity", isRefetching && "opacity-60")}
        >
            <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: "var(--color-text)", fillOpacity: 0.55 }}
                        angle={-30}
                        textAnchor="end"
                        height={70}
                        interval={0}
                    />
                    <YAxis
                        tick={{ fontSize: 12, fill: "var(--color-text)", fillOpacity: 0.55 }}
                        tickFormatter={(value) => `${value} kWh`}
                        width={70}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                        dataKey="kwh"
                        fill="var(--color-accent)"
                        radius={[4, 4, 0, 0]}
                        name="kWh"
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
