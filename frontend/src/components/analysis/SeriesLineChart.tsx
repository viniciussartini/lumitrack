import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import type { SeriesChartPoint } from "@/lib/meterReadingSeries"

interface RechartsPayloadEntry {
    payload: SeriesChartPoint
}

const isRechartsPayloadEntry = (v: unknown): v is RechartsPayloadEntry =>
    typeof v === "object" &&
    v !== null &&
    "payload" in v &&
    typeof (v as RechartsPayloadEntry).payload === "object"

interface ChartTooltipProps {
    active?: boolean
    format: (raw: number) => string
    payload?: unknown[]
}

const ChartTooltip = ({ active, payload, format }: ChartTooltipProps) => {
    if (!active || !Array.isArray(payload) || payload.length === 0) return null

    const entry = payload[0]
    if (!isRechartsPayloadEntry(entry)) return null

    return (
        <div className="border-divider bg-surface border px-3 py-2 text-xs">
            <p className="font-heading font-semibold">{entry.payload.label}</p>
            <p className="text-muted mt-0.5">
                {entry.payload.value === null ? "-" : format(entry.payload.value)}
            </p>
        </div>
    )
}

interface SeriesLineChartProps {
    points: SeriesChartPoint[]
    /** Mesmo formatador de `getSeriesMetricDefinition` — reaproveita a convenção de unidade dos cards ao vivo. */
    format: (raw: number) => string
}

/**
 * Gráfico de linha da área de análise configurável (LumiTrack Home v2.dc.html,
 * `buildGzChart`) — mesmo padrão `recharts`/`LineChart` de `RealtimePowerChart`
 * (grid, eixos, tooltip), com `dataKey`/unidade genéricos em vez de fixos em
 * "kW": a grandeza escolhida no formulário decide o formatador dos eixos e
 * do tooltip. `connectNulls={false}` (padrão do recharts) faz um balde sem
 * leitura virar um vazio no traçado, nunca um ponto em 0.
 */
export const SeriesLineChart = ({ points, format }: SeriesLineChartProps) => (
    <div data-testid="series-line-chart">
        <ResponsiveContainer width="100%" height={256}>
            <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-divider" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) => format(value)}
                    width={72}
                />
                <Tooltip content={<ChartTooltip format={format} />} />
                <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-accent-600)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                />
            </LineChart>
        </ResponsiveContainer>
    </div>
)
