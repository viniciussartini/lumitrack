import { useEffect, useState } from "react"
import { WifiOff, Zap } from "lucide-react"
import { useRealtime } from "@/contexts/RealtimeContext"
import { formatCurrentRms, formatPowerW, formatVoltageRms } from "@/lib/format"
import { cn } from "@/lib/cn"

interface RealTimeCardProps {
    meterId: string
}

/** Leitura considerada "obsoleta" após esse tempo sem uma amostra nova. */
const STALE_THRESHOLD_MS = 10_000

/** Recalcula a "idade" da última leitura periodicamente — sem isso, o card
 * só re-renderizaria quando uma leitura NOVA chegasse, e nunca detectaria
 * sozinho que o medidor parou de transmitir. */
const STALE_CHECK_INTERVAL_MS = 2_000

/**
 * Card de tempo real — tensão/corrente/potência da última amostra recebida
 * via SSE (`reading`) para este medidor. Só faz sentido renderizar quando o
 * alvo tem medidor vinculado (decisão de exibição é do `MeterSection`).
 */
export const RealTimeCard = ({ meterId }: RealTimeCardProps) => {
    const { readingsByMeterId } = useRealtime()
    const reading = readingsByMeterId[meterId]
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const interval = setInterval(
            () => setNow(Date.now()),
            STALE_CHECK_INTERVAL_MS,
        )
        return () => clearInterval(interval)
    }, [])

    const isStale =
        !reading ||
        now - new Date(reading.receivedAt).getTime() > STALE_THRESHOLD_MS

    return (
        <div
            data-testid="real-time-card"
            className={cn(
                "rounded-lg border bg-white p-5 shadow-sm",
                "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
            )}
        >
            <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-brand-500" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Tempo real
                </h3>
            </div>

            {isStale ? (
                <div
                    className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
                    data-testid="real-time-card-stale"
                >
                    <WifiOff className="h-4 w-4" aria-hidden="true" />
                    Sem leitura recente
                </div>
            ) : (
                <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Metric label="Tensão rms" value={formatVoltageRms(reading.voltage)} />
                    <Metric label="Corrente rms" value={formatCurrentRms(reading.current)} />
                    <Metric
                        label="Potência ativa média"
                        value={formatPowerW(reading.powerW)}
                    />
                </dl>
            )}
        </div>
    )
}

interface MetricProps {
    label: string
    value: string
}

const Metric = ({ label, value }: MetricProps) => (
    <div>
        <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {value}
        </dd>
    </div>
)
