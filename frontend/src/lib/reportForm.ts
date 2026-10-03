import {
    COMPARE_PERIOD_MAX_DAYS,
    addDaysToIsoDate,
    countInclusiveDays,
    formatDays,
    startOfSaoPauloDay,
} from "@/lib/periodComparison"
import type { CompareTargetOption } from "@/lib/periodComparison"
import type { CreateReportInput, ReportFormat, ReportType } from "@/types/report.types"

export const REPORT_TYPE_OPTIONS: readonly { value: ReportType; label: string }[] = [
    { value: "MONTHLY", label: "Mensal" },
    { value: "CONSUMPTION", label: "Consumo" },
    { value: "ALERTS", label: "Alertas" },
    { value: "POWER_QUALITY", label: "Qualidade de energia" },
    { value: "DEMAND", label: "Demanda" },
]

/** Rótulo de cada tipo de relatório, para o histórico e as configurações de envio. */
export const REPORT_TYPE_LABELS: Record<ReportType, string> = Object.fromEntries(
    REPORT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ReportType, string>

/**
 * Os tipos cobrem o período de um mês inteiro (escolhido por "AAAA-MM") ou um
 * intervalo livre de datas. O mensal e a demanda são de mês: a demanda é
 * apurada por mês de faturamento.
 */
export const usesMonthPeriod = (type: ReportType): boolean =>
    type === "MONTHLY" || type === "DEMAND"

/**
 * Tipos que o alvo comporta. A demanda só existe na propriedade do Grupo A:
 * área, dispositivo e propriedade do Grupo B não têm demanda contratada.
 *
 * @param target - O alvo escolhido.
 */
export function reportTypeOptionsFor(
    target: CompareTargetOption,
): readonly { value: ReportType; label: string }[] {
    const supportsDemand = target.targetType === "PROPERTY" && target.tariffGroup === "GROUP_A"
    return REPORT_TYPE_OPTIONS.filter((option) => option.value !== "DEMAND" || supportsDemand)
}

/** O rascunho do formulário de emissão; datas como o `<input>` as guarda (vazio se não preenchido). */
export interface ReportFormState {
    type: ReportType
    /** `AAAA-MM`, usado nos tipos de mês (mensal e demanda). */
    month: string
    /** `AAAA-MM-DD`, usados nos tipos de período livre. */
    start: string
    end: string
    format: ReportFormat
}

/**
 * Regra do período que o backend também impõe — validada aqui para o usuário
 * ver o motivo antes de enviar.
 *
 * @param state - O rascunho do formulário.
 * @returns A mensagem do problema, ou `null` se válido (ou se o período ainda
 *   está incompleto: o preenchimento é exigido pelo próprio formulário).
 */
export function validateReportForm(state: ReportFormState): string | null {
    if (usesMonthPeriod(state.type) || !state.start || !state.end) return null
    if (state.end < state.start) return "O fim não pode ser anterior ao início."
    if (countInclusiveDays(state.start, state.end) > COMPARE_PERIOD_MAX_DAYS) {
        return `O período pode ter no máximo ${formatDays(COMPARE_PERIOD_MAX_DAYS)}.`
    }
    return null
}

/** O período está completo para o tipo escolhido? */
export function isReportPeriodFilled(state: ReportFormState): boolean {
    return usesMonthPeriod(state.type) ? state.month !== "" : state.start !== "" && state.end !== ""
}

/**
 * Traduz o rascunho (dias inteiros) para o corpo da API. O intervalo dos
 * tipos de período livre vai da meia-noite de São Paulo do primeiro dia até a
 * do dia seguinte ao último — fim exclusivo, como o filtro do backend.
 *
 * @param state - O rascunho do formulário, já validado e completo.
 * @param target - O alvo escolhido.
 * @returns O corpo de `POST /api/reports`.
 */
export function buildCreateReportInput(
    state: ReportFormState,
    target: CompareTargetOption,
): CreateReportInput {
    const base = { targetType: target.targetType, targetId: target.targetId, format: state.format }
    if (state.type === "MONTHLY" || state.type === "DEMAND") {
        return { ...base, type: state.type, month: state.month }
    }
    return {
        ...base,
        type: state.type,
        from: startOfSaoPauloDay(state.start),
        to: startOfSaoPauloDay(addDaysToIsoDate(state.end, 1)),
    }
}

export interface MonthOption {
    /** `AAAA-MM`. */
    value: string
    /** Ex.: "julho de 2026". */
    label: string
}

/**
 * Os últimos meses, do mais recente ao mais antigo, para o seletor do
 * relatório mensal. Lista em vez de `<input type="month">`: o Firefox de
 * desktop não tem seletor de mês e cairia num campo de texto livre.
 *
 * @param now - Hoje, no fuso do navegador.
 * @param count - Quantos meses listar, contando o atual.
 * @returns As opções, mês atual primeiro.
 */
export function buildMonthOptions(now: Date, count: number): MonthOption[] {
    return Array.from({ length: count }, (_, i) => {
        const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1))
        const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
        const label = date.toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        })
        return { value, label }
    })
}
