import type { ConsumptionBucket } from "@/types/consumption.types"

/**
 * "YYYY-MM-DD" a partir do calendário LOCAL do browser — sem conversão
 * explícita de fuso. Usada só para instantes reais (`now`, "ontem" derivado
 * de `now`) — assume-se que o browser do usuário está em America/Sao_Paulo
 * (verdade na prática: produto brasileiro), mesma simplificação já aceita
 * no resto do app. **Não usar para decodificar `bucketStart` do backend**
 * — ver `bucketDateKey`, que existe exatamente por esses dois casos não
 * serem intercambiáveis.
 */
export const toLocalDateKey = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

/**
 * "YYYY-MM-DD" a partir de um `bucketStart` de dia devolvido pelo backend.
 *
 * O backend grava o bucket de dia como timestamp NAIVE cujos dígitos já são
 * o horário de parede de São Paulo (`AT TIME ZONE` duplo em
 * `timeBucket.ts`), e o driver decodifica esse naive tratando os dígitos
 * como se já fossem UTC — ou seja, meia-noite de SP do dia 21 chega ao
 * frontend como `"2026-08-21T00:00:00.000Z"`. Ler isso com getters LOCAIS
 * (como `toLocalDateKey` faz) aplicaria um SEGUNDO deslocamento de fuso por
 * cima de um valor que já não é um instante UTC de verdade — em
 * America/Sao_Paulo (UTC-3), a meia-noite de SP do dia 21 vira 21h do dia
 * 20 local, e a chave calculada fica um dia adiantada em relação ao bucket
 * real. Getters UTC desfazem exatamente essa codificação, sem aplicar
 * nenhuma conversão nova.
 */
export const bucketDateKey = (bucketStart: string): string => {
    const date = new Date(bucketStart)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    const day = String(date.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

/**
 * Busca o bucket cuja data bate com `date` — por DATA, não por posição no
 * array. Buckets são esparsos (só existem dias com leitura real), então
 * `items[0]` nem sempre é "hoje": se o medidor ainda não transmitiu hoje, o
 * bucket mais recente pode ser de ontem.
 *
 * `date` é um instante real (decodificado via `toLocalDateKey`); os itens
 * vêm do backend (decodificados via `bucketDateKey`) — os dois métodos são
 * diferentes de propósito, não uma inconsistência (ver os comentários de
 * cada um).
 */
export const findBucketForDate = (
    items: ConsumptionBucket[],
    date: Date,
): ConsumptionBucket | undefined => {
    const key = toLocalDateKey(date)
    return items.find((item) => bucketDateKey(item.bucketStart) === key)
}

/**
 * "YYYY-MM" a partir de um `bucketStart` de MÊS devolvido pelo backend.
 *
 * Mesma codificação problemática de `bucketDateKey`, só que truncada no dia
 * 1: o backend grava o bucket de mês como timestamp NAIVE de meia-noite SP
 * do dia 1, decodificado pelo driver como se já fosse UTC. Getters UTC
 * desfazem essa codificação sem aplicar conversão nova — getters locais
 * (America/Sao_Paulo, UTC-3) empurrariam o dia 1 meia-noite pro dia 31 do
 * mês anterior às 21h, e `getMonth()` devolveria o mês errado pra **todo**
 * bucket de mês, não um caso de borda raro.
 */
export const bucketMonthKey = (bucketStart: string): string => {
    const date = new Date(bucketStart)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    return `${year}-${month}`
}

/**
 * "YYYY-MM" a partir do calendário LOCAL — mesmo propósito de
 * `toLocalDateKey`, só que por mês. Usada só para instantes reais (`now`).
 */
export const toLocalMonthKey = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${year}-${month}`
}

/**
 * Busca o bucket de MÊS que bate com o mês de `date` — mesma lógica de
 * `findBucketForDate`, um nível de granularidade acima: `date` é decodificado
 * via `toLocalMonthKey` (instante real), os itens via `bucketMonthKey`
 * (codificação do backend).
 */
export const findBucketForMonth = (
    items: ConsumptionBucket[],
    date: Date,
): ConsumptionBucket | undefined => {
    const key = toLocalMonthKey(date)
    return items.find((item) => bucketMonthKey(item.bucketStart) === key)
}

/**
 * Variação percentual de hoje em relação a ontem. `null` quando não dá pra
 * calcular (base zero) — não inventa um número (ex.: "+∞%" ou "0%" enganoso).
 */
export const computeTodayDelta = (todayKwh: number, yesterdayKwh: number): number | null => {
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
