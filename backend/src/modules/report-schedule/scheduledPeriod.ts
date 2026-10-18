import type { ReportFormat, ReportType, TargetType } from "@/generated/prisma/client.js"
import type { CreateReportInput } from "@/modules/report/report.schema.js"
import type { ReportFrequency } from "@/modules/report-schedule/nextRun.js"
import { fromSaoPauloLocal, toSaoPauloLocal } from "@/shared/time/localTime.js"

/**
 * Maior período que uma execução agendada cobre: o anual, de 365 ou 366 dias.
 * É por isso que o teto do relatório manual (92 dias) não serve aqui, e o
 * limite de baldes diários do `ReportService` precisa comportar este valor.
 */
export const LONGEST_SCHEDULED_PERIOD_DAYS = 366

const DAY_MS = 24 * 60 * 60 * 1000

const MONTHS_BACK: Record<"MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL", number> = {
    MONTHLY: 1,
    QUARTERLY: 3,
    SEMIANNUAL: 6,
    ANNUAL: 12,
}

/** Parte de uma configuração de envio que define o que o relatório cobre. */
export interface ScheduledReportSpec {
    targetType: TargetType
    targetId: string
    type: ReportType
    format: ReportFormat
    frequency: ReportFrequency
    /** Dia de envio configurado: o dia do mês (ou da semana) antes de qualquer ajuste de mês curto. */
    sendDay: number | null
}

const daysInMonth = (year: number, month: number): number =>
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

// Meia-noite local do dia do envio, na convenção "hora local nos getters UTC".
const localMidnight = (local: Date): Date =>
    new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))

// Dia do envio anterior, `monthsBack` meses antes. O dia é o configurado, e
// não o do slot atual: o slot de 28/02 de quem escolheu o dia 31 ajustou o dia
// para caber no mês, mas o envio de janeiro saiu no dia 31. Recuar a partir do
// dia ajustado deixaria dias de janeiro em dois relatórios seguidos.
function previousMonthBasedSend(midnight: Date, monthsBack: number, sendDay: number): Date {
    const target = new Date(
        Date.UTC(midnight.getUTCFullYear(), midnight.getUTCMonth() - monthsBack, 1),
    )
    const day = Math.min(sendDay, daysInMonth(target.getUTCFullYear(), target.getUTCMonth()))
    return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day))
}

function requireSendDay(spec: ScheduledReportSpec): number {
    if (spec.sendDay === null) {
        throw new Error(`A frequência ${spec.frequency} exige o dia do envio`)
    }
    return spec.sendDay
}

function previousCalendarMonth(local: Date): string {
    const date = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Pedido de relatório que uma execução agendada emite. O período depende do
 * slot (e não de "agora"), então um envio atrasado por queda do servidor
 * cobre o mesmo intervalo que cobriria no horário.
 *
 * Os de mês inteiro (mensal e demanda) cobrem o mês-calendário anterior ao
 * slot; os de período livre (consumo, alertas e qualidade de energia) cobrem
 * o intervalo desde o envio anterior, terminando à meia-noite local do dia
 * do slot (o fim é exclusivo).
 *
 * @param spec - Alvo, tipo, formato e frequência da configuração.
 * @param slotAt - Instante em que o envio estava marcado.
 * @returns O pedido, no mesmo formato da emissão manual.
 */
export function resolveScheduledReportInput(
    spec: ScheduledReportSpec,
    slotAt: Date,
): CreateReportInput {
    const base = { targetType: spec.targetType, targetId: spec.targetId, format: spec.format }
    const local = toSaoPauloLocal(slotAt)

    if (spec.type === "MONTHLY" || spec.type === "DEMAND") {
        return { ...base, type: spec.type, month: previousCalendarMonth(local) }
    }

    const midnight = localMidnight(local)
    const start =
        spec.frequency === "DAILY"
            ? new Date(midnight.getTime() - DAY_MS)
            : spec.frequency === "WEEKLY"
              ? new Date(midnight.getTime() - 7 * DAY_MS)
              : previousMonthBasedSend(midnight, MONTHS_BACK[spec.frequency], requireSendDay(spec))

    return {
        ...base,
        type: spec.type,
        from: fromSaoPauloLocal(start),
        to: fromSaoPauloLocal(midnight),
    }
}
