import type { ConsumptionBucket } from "@/types/consumption.types"

/**
 * "YYYY-MM-DD" a partir do calendário LOCAL do browser — sem conversão
 * explícita de fuso. Mesma convenção já usada implicitamente por
 * `formatBucketLabel` (`lib/formatters/consumption.ts`), que também formata
 * `bucketStart` via `new Date(...)` sem especificar `timeZone`. Os buckets
 * de dia são agregados pelo backend em America/Sao_Paulo — assume-se que o
 * browser do usuário está no mesmo fuso (verdade na prática: produto
 * brasileiro), mesma simplificação já aceita no resto do app.
 */
export const toLocalDateKey = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

/**
 * Busca o bucket cuja data (calendário local) bate com `date` — por DATA,
 * não por posição no array. Buckets são esparsos (só existem dias com
 * leitura real), então `items[0]` nem sempre é "hoje": se o medidor ainda
 * não transmitiu hoje, o bucket mais recente pode ser de ontem.
 */
export const findBucketForDate = (
    items: ConsumptionBucket[],
    date: Date,
): ConsumptionBucket | undefined => {
    const key = toLocalDateKey(date)
    return items.find((item) => toLocalDateKey(new Date(item.bucketStart)) === key)
}

/**
 * Variação percentual de hoje em relação a ontem. `null` quando não dá pra
 * calcular (base zero) — não inventa um número (ex.: "+∞%" ou "0%" enganoso).
 */
export const computeTodayDelta = (
    todayKwh: number,
    yesterdayKwh: number,
): number | null => {
    if (yesterdayKwh === 0) return null
    return (todayKwh - yesterdayKwh) / yesterdayKwh
}

/** Quantidade de dias do mês de `date` (ex.: fevereiro → 28 ou 29). */
export const daysInMonth = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()

/**
 * Projeção linear (regra de 3) do custo do mês inteiro, a partir do custo já
 * acumulado até `dayOfMonth`. Aproximação declarada (rotulada "projetado"
 * na UI) — não é o que o backend calcularia ao fechar o mês de verdade.
 */
export const computeMonthProjection = (
    costSoFar: number,
    dayOfMonth: number,
    totalDaysInMonth: number,
): number => {
    if (dayOfMonth <= 0) return costSoFar
    return (costSoFar / dayOfMonth) * totalDaysInMonth
}
