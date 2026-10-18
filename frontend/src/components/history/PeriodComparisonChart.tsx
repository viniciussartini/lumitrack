import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import type { ComparisonChartPoint } from "@/lib/periodComparisonChart"

export const PERIOD_A_COLOR = "var(--color-chart-blue)"
export const PERIOD_B_COLOR = "var(--color-chart-amber)"

interface RechartsPayloadEntry {
    payload: ComparisonChartPoint
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

const formatValue = (value: number | null, format: (raw: number) => string): string =>
    value === null ? "-" : format(value)

const ChartTooltip = ({ active, payload, format }: ChartTooltipProps) => {
    if (!active || !Array.isArray(payload) || payload.length === 0) return null

    const entry = payload[0]
    if (!isRechartsPayloadEntry(entry)) return null
    const point = entry.payload

    return (
        <div className="border-divider bg-surface border px-3 py-2 text-xs">
            <p className="font-heading font-semibold">{point.label}</p>
            <p className="text-muted mt-0.5">
                A · {point.dateA}: {formatValue(point.valueA, format)}
            </p>
            <p className="text-muted mt-0.5">
                B · {point.dateB}: {formatValue(point.valueB, format)}
            </p>
        </div>
    )
}

interface PeriodComparisonChartProps {
    points: ComparisonChartPoint[]
    /** Formatador da grandeza escolhida — o mesmo dos cards e da tabela de análise. */
    format: (raw: number) => string
}

/**
 * Gráfico comparativo do Histórico: duas linhas (A e B) sobrepostas, por
 * posição de balde. Mesmo padrão `recharts` de `SeriesLineChart`; a escala do
 * eixo Y é automática de propósito, para que diferenças pequenas (220 V ×
 * 221 V) apareçam. `connectNulls={false}` faz um balde sem leitura virar um
 * vazio no traçado, nunca um ponto em 0.
 */
export const PeriodComparisonChart = ({ points, format }: PeriodComparisonChartProps) => (
    <div data-testid="period-comparison-chart">
        <ResponsiveContainer width="100%" height={256}>
            <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-divider" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) => format(value)}
                    width={72}
                    domain={["auto", "auto"]}
                />
                <Tooltip content={<ChartTooltip format={format} />} />
                <Line
                    type="monotone"
                    dataKey="valueA"
                    stroke={PERIOD_A_COLOR}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                />
                <Line
                    type="monotone"
                    dataKey="valueB"
                    stroke={PERIOD_B_COLOR}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                />
            </LineChart>
        </ResponsiveContainer>
    </div>
)
