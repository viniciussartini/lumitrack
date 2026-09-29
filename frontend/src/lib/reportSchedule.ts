import type { CompareTargetOption } from "@/lib/periodComparison"
import type {
    ReportFormat,
    ReportFrequency,
    ReportSchedule,
    ReportScheduleInput,
    ReportType,
} from "@/types/report.types"

const SAO_PAULO_TZ = "America/Sao_Paulo"

/** Espelham os tetos do backend, para o usuário ver o motivo antes de enviar. */
export const MAX_RECIPIENTS = 10
export const MAX_SCHEDULES = 20

export const FREQUENCY_OPTIONS: readonly { value: ReportFrequency; label: string }[] = [
    { value: "DAILY", label: "Diária" },
    { value: "WEEKLY", label: "Semanal" },
    { value: "MONTHLY", label: "Mensal" },
    { value: "QUARTERLY", label: "Trimestral" },
    { value: "SEMIANNUAL", label: "Semestral" },
    { value: "ANNUAL", label: "Anual" },
]

/** Dias da semana na numeração do backend: 1 = segunda … 7 = domingo. */
export const WEEKDAY_OPTIONS: readonly { value: number; label: string }[] = [
    { value: 1, label: "Segunda-feira" },
    { value: 2, label: "Terça-feira" },
    { value: 3, label: "Quarta-feira" },
    { value: 4, label: "Quinta-feira" },
    { value: 5, label: "Sexta-feira" },
    { value: 6, label: "Sábado" },
    { value: 7, label: "Domingo" },
]

const TYPE_LABELS: Record<ReportType, string> = { MONTHLY: "Mensal", CONSUMPTION: "Consumo" }

// Meses de envio de cada frequência de calendário, como o backend os calcula.
const MONTHS_HINT: Partial<Record<ReportFrequency, string>> = {
    QUARTERLY: " (jan, abr, jul, out)",
    SEMIANNUAL: " (jan, jul)",
    ANNUAL: " de janeiro",
}

/** O rascunho do formulário de agendamento; `sendDay` como o `<input>` o guarda. */
export interface ScheduleFormState {
    type: ReportType
    frequency: ReportFrequency
    sendDay: string
    /** Endereços separados por vírgula, ponto e vírgula ou quebra de linha. */
    recipients: string
    format: ReportFormat
    active: boolean
}

export const INITIAL_SCHEDULE_FORM: ScheduleFormState = {
    type: "MONTHLY",
    frequency: "MONTHLY",
    sendDay: "1",
    recipients: "",
    format: "PDF",
    active: true,
}

/**
 * Muda o tipo mantendo o rascunho coerente: o relatório mensal só existe com
 * frequência mensal, então escolhê-lo já fixa a frequência.
 *
 * @param state - Rascunho atual.
 * @param type - Novo tipo.
 */
export function applyScheduleType(state: ScheduleFormState, type: ReportType): ScheduleFormState {
    return type === "MONTHLY"
        ? applyScheduleFrequency({ ...state, type }, "MONTHLY")
        : { ...state, type }
}

/**
 * Muda a frequência ajustando o dia do envio ao que ela aceita: nenhum na
 * diária, dia da semana (1–7) na semanal, dia do mês (1–31) nas demais.
 *
 * @param state - Rascunho atual.
 * @param frequency - Nova frequência.
 */
export function applyScheduleFrequency(
    state: ScheduleFormState,
    frequency: ReportFrequency,
): ScheduleFormState {
    const day = Number(state.sendDay)
    if (frequency === "DAILY") return { ...state, frequency, sendDay: "" }
    if (frequency === "WEEKLY") {
        const valid = Number.isInteger(day) && day >= 1 && day <= 7
        return { ...state, frequency, sendDay: valid ? state.sendDay : "1" }
    }
    return { ...state, frequency, sendDay: state.sendDay === "" ? "1" : state.sendDay }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Endereços do campo de destinatários: separa por vírgula, ponto e vírgula ou
 * quebra de linha, tira espaços, passa para minúsculas e remove repetidos.
 *
 * @param text - Conteúdo bruto do campo.
 * @returns A lista de endereços, sem validar o formato.
 */
export function parseRecipients(text: string): string[] {
    const parts = text
        .split(/[,;\n]/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part !== "")
    return [...new Set(parts)]
}

/**
 * Regras do backend, validadas aqui para o usuário ver o motivo antes de enviar.
 *
 * @param state - O rascunho do formulário.
 * @returns A mensagem do primeiro problema, ou `null` se válido (ou se o campo
 *   de destinatários ainda está vazio: o preenchimento é exigido pelo formulário).
 */
export function validateScheduleForm(state: ScheduleFormState): string | null {
    const recipients = parseRecipients(state.recipients)
    const invalid = recipients.find((address) => !EMAIL_PATTERN.test(address))
    if (invalid !== undefined) return `E-mail inválido: ${invalid}`
    if (recipients.length > MAX_RECIPIENTS) {
        return `No máximo ${MAX_RECIPIENTS} destinatários.`
    }

    if (state.frequency === "DAILY") return null
    const max = state.frequency === "WEEKLY" ? 7 : 31
    const day = Number(state.sendDay)
    if (state.sendDay === "" || !Number.isInteger(day) || day < 1 || day > max) {
        return `O dia do envio deve estar entre 1 e ${max}.`
    }
    return null
}

/** O rascunho está completo para enviar? */
export function isScheduleFormFilled(state: ScheduleFormState): boolean {
    return parseRecipients(state.recipients).length > 0
}

/**
 * Corpo da API a partir do rascunho.
 *
 * @param state - O rascunho, já validado e completo.
 * @param target - O alvo escolhido.
 */
export function buildScheduleInput(
    state: ScheduleFormState,
    target: CompareTargetOption,
): ReportScheduleInput {
    return {
        targetType: target.targetType,
        targetId: target.targetId,
        type: state.type,
        format: state.format,
        frequency: state.frequency,
        sendDay: state.frequency === "DAILY" ? null : Number(state.sendDay),
        recipients: parseRecipients(state.recipients),
        active: state.active,
    }
}

/** Rascunho de edição a partir de uma configuração já salva. */
export function scheduleToFormState(schedule: ReportSchedule): ScheduleFormState {
    return {
        type: schedule.type,
        frequency: schedule.frequency,
        sendDay: schedule.sendDay === null ? "" : String(schedule.sendDay),
        recipients: schedule.recipients.join(", "),
        format: schedule.format,
        active: schedule.active,
    }
}

/**
 * Periodicidade legível, ex.: "Mensal · dia 5", "Semanal · segunda-feira".
 *
 * @param frequency - Frequência da configuração.
 * @param sendDay - Dia do envio (nulo na diária).
 */
export function describePeriodicity(frequency: ReportFrequency, sendDay: number | null): string {
    const label = FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label ?? ""
    if (frequency === "DAILY" || sendDay === null) return label
    if (frequency === "WEEKLY") {
        const weekday = WEEKDAY_OPTIONS.find((option) => option.value === sendDay)?.label
        return `${label} · ${weekday?.toLowerCase() ?? `dia ${sendDay}`}`
    }
    return `${label} · dia ${sendDay}${MONTHS_HINT[frequency] ?? ""}`
}

/** "10/07/2026 às 06:00", na hora de São Paulo. */
export function formatNextRun(nextRunAt: string): string {
    const instant = new Date(nextRunAt)
    const date = instant.toLocaleDateString("pt-BR", { timeZone: SAO_PAULO_TZ })
    const time = instant.toLocaleTimeString("pt-BR", {
        timeZone: SAO_PAULO_TZ,
        hour: "2-digit",
        minute: "2-digit",
    })
    return `${date} às ${time}`
}

export interface ScheduleRowView {
    title: string
    meta: string
    nextRun: string
}

/**
 * Textos de uma linha da lista. O alvo vem do cadastro atual (a configuração
 * guarda só o id), com rótulo neutro se ele já não existe.
 *
 * @param schedule - A configuração.
 * @param targetLabels - Índice `TIPO:id` → rótulo do alvo.
 */
export function describeSchedule(
    schedule: ReportSchedule,
    targetLabels: Map<string, string>,
): ScheduleRowView {
    const target =
        targetLabels.get(`${schedule.targetType}:${schedule.targetId}`) ?? "Alvo removido"
    return {
        title: `${TYPE_LABELS[schedule.type]} · ${target}`,
        meta: `${describePeriodicity(schedule.frequency, schedule.sendDay)} · ${schedule.format} · ${schedule.recipients.join(", ")}`,
        nextRun: schedule.nextRunAt ? formatNextRun(schedule.nextRunAt) : "",
    }
}
