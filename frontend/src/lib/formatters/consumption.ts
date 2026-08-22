import type { BucketSize } from "@/types/consumption.types"

const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
})

const dayMonthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
})

const monthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
})

const yearFormatter = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
})

const brlFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
})

// 2-3 casas decimais: buckets de hora costumam ser pequenos (0.125 kWh) e
// cabem em 3 casas; os demais quase sempre arredondam para 2. Mín 2 garante
// "12,50" em vez de "12,5".
const kwhFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
})

const powerFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
})

/**
 * Formata `bucketStart` adaptando o nível de precisão ao tamanho do bucket
 * (não à granularidade escolhida na UI — ver `lib/consumptionWindow.ts`).
 *
 * Cada bucket cobre um intervalo diferente:
 *   minute → "15/01 14:03" (o minuto cheio)
 *   hour   → "15/01 14:00" (hh:00–hh:59)
 *   day    → "15/01" (0h–24h, sem ano)
 *   month  → "Janeiro de 2025"
 *   year   → "2025"
 *
 * Minuto e hora compartilham o formato; `day` omite o ano pelo mesmo
 * motivo: um bucket de dia, em todo consumidor deste formatador, é sempre
 * um dia dentro do mês corrente (`resolveConsumptionWindow`/
 * `resolveMonthlyHistoryWindow`, lib/consumptionWindow.ts) — nunca uma
 * listagem cruzando meses ou anos, então o ano nunca desambigua nada.
 *
 * Capitaliza a primeira letra em `month`: Intl retorna "janeiro de 2025"
 * em pt-BR; "Janeiro" fica mais coeso visualmente em eixo/tabela.
 */
export const formatBucketLabel = (bucketStart: string, bucketSize: BucketSize): string => {
    const date = new Date(bucketStart)

    switch (bucketSize) {
        case "minute":
        case "hour":
            return `${dayMonthYearFormatter.format(date).slice(0, 5)} ${hourFormatter.format(date)}`
        case "day":
            return dayMonthYearFormatter.format(date).slice(0, 5)
        case "month": {
            const formatted = monthYearFormatter.format(date)
            return formatted.charAt(0).toUpperCase() + formatted.slice(1)
        }
        case "year":
            return yearFormatter.format(date)
    }
}

/**
 * Formata kWh em pt-BR (vírgula decimal). Retorna só o número, sem sufixo —
 * a unidade fica como texto separado na UI (números tabulares à direita).
 */
export const formatKwh = (kwh: number): string => kwhFormatter.format(kwh)

/** Formata valor em BRL. */
export const formatCostBrl = (cost: number): string => brlFormatter.format(cost)

/** Formata potência média do bucket, em W. */
export const formatAvgPowerW = (powerW: number): string => `${powerFormatter.format(powerW)} W`
