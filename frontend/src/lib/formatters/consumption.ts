import type { ConsumptionPeriod } from "@/types/consumption.types"

const dayMonthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
})

const dayMonthYearHourMinuteFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

// 2-3 casas decimais: HOURLY pequeno (0.125 kWh) cabe em 3 casas; demais
// quase sempre arredondam para 2. Mín 2 garante "12,50" em vez de "12,5".
const kwhFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
})

/**
 * Formata referenceDate adaptando o nível de precisão ao period.
 *
 * Cada period tem precisão semântica diferente — mostrar "01/01/2025"
 * para um registro MONTHLY parece um registro do dia 1º (errado: representa
 * o mês todo). A formatação adaptada deixa a granularidade legível:
 *
 *   HOURLY  → "15/01/2025 14:00"
 *   DAILY   → "15/01/2025"
 *   MONTHLY → "Janeiro de 2025"
 *   ANNUAL  → "2025"
 *
 * Capitaliza a primeira letra em MONTHLY: Intl retorna "janeiro de 2025"
 * em pt-BR; "Janeiro" fica mais coeso visualmente em uma coluna de tabela.
 */
export const formatReferenceDate = (
    referenceDate: string,
    period: ConsumptionPeriod,
): string => {
    const date = new Date(referenceDate)

    switch (period) {
        case "HOURLY":
            return dayMonthYearHourMinuteFormatter.format(date)
        case "DAILY":
            return dayMonthYearFormatter.format(date)
        case "MONTHLY": {
            const formatted = monthYearFormatter.format(date)
            return formatted.charAt(0).toUpperCase() + formatted.slice(1)
        }
        case "ANNUAL":
            return yearFormatter.format(date)
    }
}

/**
 * Formata kWh em pt-BR (vírgula como separador decimal).
 *
 * Retorna SÓ o número, sem o sufixo "kWh" — o sufixo fica como texto
 * separado na UI para manter alinhamento numérico em colunas (números
 * tabulares à direita, unidade em cor secundária ao lado).
 */
export const formatKwh = (kwh: number): string => kwhFormatter.format(kwh)

/**
 * Formata valor em BRL. Aceita null e retorna "—" (em-dash) — usado para
 * registros legados ou cálculo falho no backend (cost depende da
 * distribuidora vinculada à propriedade, que pode ter sido removida).
 */
export const formatCostBrl = (cost: number | null): string => {
    if (cost === null) return "—"
    return brlFormatter.format(cost)
}