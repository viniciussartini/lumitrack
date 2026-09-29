import type { ReportFormat, ReportType, TargetType } from "@/generated/prisma/client.js"
import type { CreateReportInput } from "@/modules/report/report.schema.js"
import type { ReportFrequency } from "@/modules/report-schedule/nextRun.js"
import { fromSaoPauloLocal, toSaoPauloLocal } from "@/shared/time/localTime.js"

/**
 * Teto do período de um relatório agendado. O anual é o maior (365 ou 366
 * dias), então o teto do relatório manual (92 dias) não serve aqui.
 */
export const MAX_SCHEDULED_REPORT_PERIOD_DAYS = 366

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
}

const daysInMonth = (year: number, month: number): number =>
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

// Meia-noite local do dia do envio, na convenção "hora local nos getters UTC".
const localMidnight = (local: Date): Date =>
    new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))

// Mesmo dia do mês, `monthsBack` meses antes; mês mais curto cai no último dia.
function monthsBefore(midnight: Date, monthsBack: number): Date {
    const target = new Date(
        Date.UTC(midnight.getUTCFullYear(), midnight.getUTCMonth() - monthsBack, 1),
    )
    const day = Math.min(
        midnight.getUTCDate(),
        daysInMonth(target.getUTCFullYear(), target.getUTCMonth()),
    )
    return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day))
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
 * O mensal cobre o mês-calendário anterior ao slot; o de consumo cobre o
 * intervalo desde o envio anterior, terminando à meia-noite local do dia do
 * slot (o fim é exclusivo).
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

    if (spec.type === "MONTHLY") {
        return { ...base, type: "MONTHLY", month: previousCalendarMonth(local) }
    }

    const midnight = localMidnight(local)
    const start =
        spec.frequency === "DAILY"
            ? new Date(midnight.getTime() - DAY_MS)
            : spec.frequency === "WEEKLY"
              ? new Date(midnight.getTime() - 7 * DAY_MS)
              : monthsBefore(midnight, MONTHS_BACK[spec.frequency])

    return {
        ...base,
        type: "CONSUMPTION",
        from: fromSaoPauloLocal(start),
        to: fromSaoPauloLocal(midnight),
    }
}
