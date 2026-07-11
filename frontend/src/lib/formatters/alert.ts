/**
 * Formatadores de Alerta (Fase 5 — faixa de potência).
 *
 * Diferente do modelo antigo (thresholdKwh + target polimórfico resolvido
 * no frontend via lookup), o backend agora resolve o alvo diretamente
 * (`AlertWithStatus.target`), então não há mais formatAlertTarget/lookup
 * aqui — só formatação numérica/temporal.
 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
})

const KW_FORMATTER = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
})

const PERCENT_FORMATTER = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
})

const POWER_W_FORMATTER = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
})

/** formatReferencePowerKw(10) → "10 kW" */
export const formatReferencePowerKw = (value: number): string =>
    `${KW_FORMATTER.format(value)} kW`

/** formatTolerancePercent(2.5) → "±2,5%" */
export const formatTolerancePercent = (value: number): string =>
    `±${PERCENT_FORMATTER.format(value)}%`

/** formatPowerW(1050) → "1050 W" — usado no histórico de episódios. */
export const formatPowerW = (value: number): string =>
    `${POWER_W_FORMATTER.format(value)} W`

/** formatDateTime("2025-11-15T14:30:00Z") → "15/11/2025, 11:30" (tz local) */
export const formatDateTime = (value: string): string =>
    DATE_TIME_FORMATTER.format(new Date(value))

/**
 * Formata duração em segundos como "Xh Ymin Zs" (omitindo unidades zeradas
 * à esquerda). Usado no histórico de episódios (`AlertTriggerEvent`).
 * formatDurationSeconds(3725) → "1h 2min 5s"
 * formatDurationSeconds(45)   → "45s"
 */
export const formatDurationSeconds = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = Math.floor(totalSeconds % 60)

    const parts: string[] = []
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}min`)
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)

    return parts.join(" ")
}
