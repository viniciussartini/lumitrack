/**
 * Formatadores baseados em Intl. Funções puras, sem efeitos colaterais.
 *
 * Por que Intl em vez de string template?
 *   - Suporte nativo a localização (pt-BR), separadores corretos (vírgula
 *     decimal, ponto para milhar), arredondamento previsível.
 *   - Performance: instâncias de Intl.NumberFormat são cacheadas pelo runtime.
 */

const brlFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
})

const percentFormatter = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
})

/**
 * Formata um valor numérico em BRL.
 * formatBrl(1234.5) → "R$ 1.234,50"
 * formatBrl(null)   → "—"
 */
export const formatBrl = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "—"
    return brlFormatter.format(value)
}

/**
 * Formata um valor decimal (0–1) como porcentagem.
 * formatPercent(0.12) → "12%"
 * formatPercent(0.125) → "12,5%"
 * formatPercent(null) → "—"
 */
export const formatPercent = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "—"
    return percentFormatter.format(value)
}

/**
 * Formata uma tensão em volts.
 * formatVoltage(220) → "220 V"
 */
export const formatVoltage = (value: number): string => `${value} V`

/**
 * Formata kWh com casas decimais e unidade.
 * formatKwh(0.75)   → "R$ 0,75/kWh"
 */
export const formatKwhPrice = (value: number): string =>
    `${formatBrl(value)}/kWh`

/**
 * Trunca uma string adicionando elipse no final.
 * Útil para nomes longos em cards.
 */
export const truncate = (value: string, maxLength: number): string =>
    value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`