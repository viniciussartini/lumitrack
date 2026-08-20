import type { PowerHistoryPoint } from "@/hooks/usePowerHistory"
import type { RealtimeWindow } from "@/components/dashboard/RealtimeWindowToggle"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

export interface PowerBucket {
    bucketStart: number
    kw: number
}

function floorToStep(t: number, stepMs: number): number {
    return Math.floor(t / stepMs) * stepMs
}

/**
 * Agrega o buffer bruto de leituras SSE (`usePowerHistory`, ~1 ponto/s) em
 * baldes alinhados ao relógio local — não é janela deslizante:
 *
 *   "1h" → baldes de 1 minuto, do minuto 00 da hora corrente até o último
 *          minuto já fechado. Ex.: agora 19:45, mostra 19:00–19:44; o
 *          balde de 19:45 só aparece quando o relógio vira 19:46.
 *   "24h" → baldes de 1 hora, de 0h do dia corrente até a última hora já
 *           fechada. Ex.: agora 19:xx, mostra 0h–18h; a hora 19 só aparece
 *           quando o relógio vira 20h.
 *
 * O balde em curso nunca aparece — seu agregado não está "fechado" ainda.
 * Baldes sem nenhuma amostra são omitidos (não viram zero), para não
 * desenhar uma queda falsa onde só falta dado (ex.: logo após abrir a
 * página, com o buffer ainda vazio pra boa parte do período).
 *
 * "Agora" é aproximado pelo timestamp da leitura mais recente do buffer
 * (não `Date.now()` — proibido no corpo de render pelo compilador do
 * React), mesmo padrão já usado por `RealtimePowerChart` antes desta
 * função existir.
 */
export function aggregateCompletedPowerBuckets(
    history: readonly PowerHistoryPoint[],
    window: RealtimeWindow,
): PowerBucket[] {
    if (history.length === 0) return []

    const latestT = history[history.length - 1]!.t
    const stepMs = window === "1h" ? MINUTE_MS : HOUR_MS

    const periodStart = new Date(latestT)
    if (window === "1h") {
        periodStart.setMinutes(0, 0, 0)
    } else {
        periodStart.setHours(0, 0, 0, 0)
    }
    const periodStartMs = periodStart.getTime()
    const currentBucketStart = floorToStep(latestT, stepMs)

    const sums = new Map<number, { sum: number; count: number }>()
    for (const point of history) {
        if (point.t < periodStartMs || point.t >= currentBucketStart) continue

        const bucketStart = floorToStep(point.t, stepMs)
        const entry = sums.get(bucketStart)
        if (entry) {
            entry.sum += point.kw
            entry.count += 1
        } else {
            sums.set(bucketStart, { sum: point.kw, count: 1 })
        }
    }

    const buckets: PowerBucket[] = []
    for (let t = periodStartMs; t < currentBucketStart; t += stepMs) {
        const entry = sums.get(t)
        if (entry) {
            buckets.push({ bucketStart: t, kw: entry.sum / entry.count })
        }
    }
    return buckets
}
