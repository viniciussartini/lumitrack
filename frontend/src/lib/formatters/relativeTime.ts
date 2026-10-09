import { formatDate } from "@/lib/format"

const SAO_PAULO_TZ = "America/Sao_Paulo"
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
})

/** Dia civil em São Paulo, como número de dias, para comparar "hoje" e "ontem". */
const dayNumber = (date: Date): number => {
    const [year, month, day] = dayFormatter.format(date).split("-").map(Number)
    return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / (24 * HOUR_MS)
}

/**
 * Quando algo aconteceu, em linguagem curta: "agora", "há 5 min", "há 2 h",
 * "ontem" e, antes disso, a data. O dia é o de São Paulo, como no resto do app.
 * Não se atualiza sozinho: vale para listas que se renovam ao recarregar.
 *
 * @param value - Instante ISO.
 * @param now - Referência; injetável nos testes.
 * @returns O texto, ou "-" se o instante for inválido.
 */
export const formatRelativeTime = (value: string, now: Date = new Date()): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "-"

    const elapsed = now.getTime() - date.getTime()
    if (elapsed < MINUTE_MS) return "agora"
    if (elapsed < HOUR_MS) return `há ${Math.floor(elapsed / MINUTE_MS)} min`

    const daysAgo = dayNumber(now) - dayNumber(date)
    if (daysAgo === 0) return `há ${Math.floor(elapsed / HOUR_MS)} h`
    if (daysAgo === 1) return "ontem"
    return formatDate(value)
}
