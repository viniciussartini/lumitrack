import type { ReportData } from "@/modules/report/report.types.js"

const SP_TZ = "America/Sao_Paulo"

const REPORT_TITLES: Record<ReportData["type"], string> = {
    MONTHLY: "Relatório mensal de consumo de energia",
    CONSUMPTION: "Relatório de consumo de energia",
}

export function reportTitle(type: ReportData["type"]): string {
    return REPORT_TITLES[type]
}

/** "dd/mm/aaaa" de um dia local (getters UTC — ver `ReportDailyRow.day`). */
export function formatLocalDay(day: Date): string {
    const dd = String(day.getUTCDate()).padStart(2, "0")
    const mm = String(day.getUTCMonth() + 1).padStart(2, "0")
    return `${dd}/${mm}/${day.getUTCFullYear()}`
}

/** "dd/mm/aaaa" de um instante real, na hora de São Paulo. */
export function formatInstantDay(instant: Date): string {
    return instant.toLocaleDateString("pt-BR", { timeZone: SP_TZ })
}

export function formatInstantDateTime(instant: Date): string {
    return instant.toLocaleString("pt-BR", { timeZone: SP_TZ })
}

/** Rótulo do período; `to` é exclusivo, então o último dia é o instante anterior. */
export function formatPeriodLabel(from: Date, to: Date): string {
    const lastDay = new Date(to.getTime() - 1)
    return `${formatInstantDay(from)} a ${formatInstantDay(lastDay)}`
}

export function formatNumber(value: number, fractionDigits = 1): string {
    return value.toLocaleString("pt-BR", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    })
}

/** Grandeza ausente é "-", nunca zero. */
export function formatOptionalNumber(value: number | null, fractionDigits = 1): string {
    return value === null ? "-" : formatNumber(value, fractionDigits)
}

export function formatBrl(value: number | null): string {
    return value === null
        ? "-"
        : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Variação com sinal explícito, ex.: "+8,4%" / "-3,0%". */
export function formatVariation(percent: number | null): string {
    if (percent === null) return "-"
    const sign = percent > 0 ? "+" : ""
    return `${sign}${formatNumber(percent, 1)}%`
}

/** Nome de arquivo gerado no servidor — nunca embute texto digitado pelo usuário. */
export function buildReportFileName(
    type: ReportData["type"],
    period: { from: Date },
    extension: "pdf" | "csv",
): string {
    const yyyy = period.from.toLocaleDateString("en-CA", { timeZone: SP_TZ }).slice(0, 7)
    return `lumitrack-relatorio-${type.toLowerCase()}-${yyyy}.${extension}`
}
