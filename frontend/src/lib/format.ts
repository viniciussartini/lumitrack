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
 * Formata uma tarifa em R$/kWh (TUSD, TE, etc.).
 * formatKwhPrice(0.75) → "R$ 0,75/kWh"
 */
export const formatKwhPrice = (value: number): string =>
    `${formatBrl(value)}/kWh`

const electricalFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

/**
 * Formatadores de grandezas elétricas — usados pelo RealTimeCard (leituras
 * SSE por medidor). Duas casas decimais, unidade colada ao número.
 * formatVoltageRms(220.4) → "220,40V"
 */
export const formatVoltageRms = (value: number): string =>
    `${electricalFormatter.format(value)}V`

export const formatCurrentRms = (value: number): string =>
    `${electricalFormatter.format(value)}A`

export const formatPowerW = (value: number): string =>
    `${electricalFormatter.format(value)}W`

/**
 * Potência em kW (não W) — usado nos KPIs "Potência agora" da hierarquia
 * (Property/Area/Device Details), convertendo a leitura crua em Watts do
 * SSE (`reading.powerW`, mesma fonte de `formatPowerW`/`RealTimeCard`).
 * formatPowerKw(3420) → "3,42kW"
 */
export const formatPowerKw = (valueInWatts: number): string =>
    `${electricalFormatter.format(valueInWatts / 1000)}kW`

/**
 * Trunca uma string adicionando elipse no final.
 * Útil para nomes longos em cards.
 */
export const truncate = (value: string, maxLength: number): string =>
    value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`