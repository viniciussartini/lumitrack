import { useMemo } from "react"
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { Activity } from "lucide-react"
import type { PowerBucket } from "@/lib/realtimePowerBuckets"

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
})

interface ChartDatum {
    label: string
    kw: number
}

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

    return (
        <div className="border-divider bg-surface border px-3 py-2 text-xs">
            <p className="font-heading font-semibold">{entry.payload.label}</p>
            <p className="text-muted mt-0.5">{entry.payload.kw.toFixed(2)} kW</p>
        </div>
    )
}

interface RealtimePowerChartProps {
    buckets: PowerBucket[]
}

/**
 * Gráfico de "Consumo em tempo real" (bloco `isDashboard` do handoff,
 * também usado em Propriedade/Área/Dispositivo via `RealtimeChartCard`) —
 * `LineChart`, não `BarChart` (diferente de `ConsumptionChart`, que plota
 * buckets de billing vindos de `/api/consumption`): aqui os baldes já vêm
 * densos e zero-preenchidos de `buildDenseWindowBuckets`
 * (`/api/meter-readings`) — este componente só formata e desenha, sem
 * agregação nenhuma própria.
 *
 * Sem frame `.blueprint` próprio — o card inteiro (header + gráfico)
 * é UM card só no handoff; o wrapper vive em `RealtimeChartCard`.
 */
export const RealtimePowerChart = ({ buckets }: RealtimePowerChartProps) => {
    const data: ChartDatum[] = useMemo(
        () =>
            buckets.map((bucket) => ({
                label: timeFormatter.format(bucket.bucketStart),
                kw: bucket.kw,
            })),
        [buckets],
    )

    if (data.length === 0) {
        return (
            <div
                data-testid="realtime-power-chart-empty"
                className="border-divider flex h-64 flex-col items-center justify-center gap-2 border border-dashed"
            >
                <Activity className="text-muted h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-muted text-sm">Aguardando leituras...</p>
            </div>
        )
    }

    return (
        <div data-testid="realtime-power-chart">
            <ResponsiveContainer width="100%" height={256}>
                <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-divider" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value: number) => `${value} kW`}
                        width={60}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                        type="monotone"
                        dataKey="kw"
                        stroke="var(--color-accent-600)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        name="kW"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
