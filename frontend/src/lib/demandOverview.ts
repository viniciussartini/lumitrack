import { formatDeviation, type GoalTone } from "@/lib/goals"
import type { ContractedDemand, DemandPoint } from "@/types/demand.types"

const SAO_PAULO_TZ = "America/Sao_Paulo"
const WINDOW_MINUTES = 15
const MINUTE_MS = 60 * 1000

const kwFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: SAO_PAULO_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
})

/** Demanda em kW com até uma casa decimal; ausência (janela sem medição) é "-", nunca 0 kW. */
export const formatDemandKw = (kw: number | null): string =>
    kw === null ? "-" : `${kwFormatter.format(kw)} kW`

/** A demanda contratada como texto do card: uma na Verde, ponta e fora de ponta na Azul. */
export const describeContracted = (contracted: readonly ContractedDemand[]): string => {
    const peak = contracted.find((demand) => demand.post === "PEAK")
    const offPeak = contracted.find((demand) => demand.post === "OFF_PEAK")
    if (peak && offPeak) {
        return `Ponta ${kwFormatter.format(peak.kw)} · Fora ${formatDemandKw(offPeak.kw)}`
    }
    return formatDemandKw(contracted[0]?.kw ?? null)
}

/** A ultrapassagem como texto e tom: "+x,x%", "sem ultrapassagem" ou "-" quando não há medição. */
export const describeExceedance = (percent: number | null): { label: string; tone: GoalTone } => {
    if (percent === null) return { label: "-", tone: "muted" }
    if (percent <= 0) return { label: "sem ultrapassagem", tone: "success" }
    return { label: formatDeviation(percent), tone: "danger" }
}

/** Uma janela posicionada no eixo do dia. */
export interface DemandSeriesEntry {
    /** Início da janela, em minutos desde a meia-noite local. */
    x: number
    /** Intervalo da janela, "12:00–12:15". */
    range: string
    kw: number | null
    contractedKw: number
    post: DemandPoint["post"]
}

const clock = (instantMs: number): string => clockFormatter.format(new Date(instantMs))

const minutesOfDay = (instantMs: number): number => {
    const [hour, minute] = clock(instantMs).split(":").map(Number)
    return (hour ?? 0) * 60 + (minute ?? 0)
}

/**
 * Posiciona cada janela pelo início, em hora local de São Paulo: a janela que
 * termina às 12:14 começa às 12:00 e cobre 12:00–12:15. Pelo início a linha em
 * degrau da contratada muda de valor exatamente quando o posto muda.
 */
export const buildDemandSeries = (points: readonly DemandPoint[]): DemandSeriesEntry[] =>
    points.map((point) => {
        const startMs = new Date(point.windowEnd).getTime() - (WINDOW_MINUTES - 1) * MINUTE_MS
        return {
            x: minutesOfDay(startMs),
            range: `${clock(startMs)}–${clock(startMs + WINDOW_MINUTES * MINUTE_MS)}`,
            kw: point.kw,
            contractedKw: point.contractedKw,
            post: point.post,
        }
    })

/** Faixa da ponta no eixo do dia, do início da primeira ao fim da última janela de ponta; nula sem ponta. */
export const peakBand = (
    series: readonly DemandSeriesEntry[],
): { from: number; to: number } | null => {
    const peak = series.filter((entry) => entry.post === "PEAK")
    if (peak.length === 0) return null
    const starts = peak.map((entry) => entry.x)
    return { from: Math.min(...starts), to: Math.max(...starts) + WINDOW_MINUTES }
}
