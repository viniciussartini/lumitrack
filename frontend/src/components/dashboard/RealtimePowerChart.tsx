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
import type { PowerHistoryPoint } from "@/hooks/usePowerHistory"
import type { RealtimeWindow } from "@/components/dashboard/RealtimeWindowToggle"

const WINDOW_MS: Record<RealtimeWindow, number> = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
}

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
    history: PowerHistoryPoint[]
    timeWindow: RealtimeWindow
}

/**
 * Gráfico de "Consumo em tempo real" (bloco `isDashboard` do handoff) —
 * `LineChart`, não `BarChart` (diferente de `ConsumptionChart`, que plota
 * buckets fixos vindos da API): aqui é uma série contínua acumulada no
 * cliente via `usePowerHistory`. Sem histórico anterior à abertura da
 * página — nasce vazio, cresce enquanto a página fica aberta.
 *
 * Sem frame `.blueprint` próprio (#117) — o card inteiro (header + gráfico)
 * é UM card só no handoff; o wrapper vive em `RealtimeSection`.
 */
export const RealtimePowerChart = ({ history, timeWindow }: RealtimePowerChartProps) => {
    const data: ChartDatum[] = useMemo(() => {
        // Corta em relação ao ponto mais recente do próprio buffer (não
        // `Date.now()`, impuro/proibido em render pelo compilador do React)
        // — na prática equivalente, já que o buffer só recebe pontos ao
        // vivo via SSE.
        const latestT = history.at(-1)?.t ?? 0
        const cutoff = latestT - WINDOW_MS[timeWindow]
        return history
            .filter((point) => point.t >= cutoff)
            .map((point) => ({
                label: timeFormatter.format(point.t),
                kw: point.kw,
            }))
    }, [history, timeWindow])

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
