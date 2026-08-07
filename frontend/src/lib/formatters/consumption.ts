import type { Granularity } from "@/types/consumption.types"

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
 * Formata `bucketStart` adaptando o nível de precisão à granularidade.
 *
 * Cada granularidade representa uma janela diferente:
 *   hour  → "15/01 14:00" (hh:00–hh:59)
 *   day   → "15/01/2025" (0h–24h)
 *   month → "Janeiro de 2025"
 *   year  → "2025"
 *
 * Capitaliza a primeira letra em `month`: Intl retorna "janeiro de 2025"
 * em pt-BR; "Janeiro" fica mais coeso visualmente em eixo/tabela.
 */
export const formatBucketLabel = (bucketStart: string, granularity: Granularity): string => {
    const date = new Date(bucketStart)

    switch (granularity) {
        case "hour":
            return `${dayMonthYearFormatter.format(date).slice(0, 5)} ${hourFormatter.format(date)}`
        case "day":
            return dayMonthYearFormatter.format(date)
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
