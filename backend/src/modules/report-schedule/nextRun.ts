import { fromSaoPauloLocal, toSaoPauloLocal } from "@/shared/time/localTime.js"

export type ReportFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL"

/** Hora local de São Paulo em que todo envio automático sai. */
export const SEND_HOUR_LOCAL = 6

const DAY_MS = 24 * 60 * 60 * 1000

// Meses (0 = janeiro) em que cada frequência de mês-base envia. Trimestre,
// semestre e ano são de calendário, ancorados em janeiro — previsível e sem
// depender de quando a configuração foi criada.
const MONTHS_BY_FREQUENCY = {
    MONTHLY: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    QUARTERLY: [0, 3, 6, 9],
    SEMIANNUAL: [0, 6],
    ANNUAL: [0],
} as const

const daysInMonth = (year: number, month: number): number =>
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

function requireDay(frequency: ReportFrequency, sendDay: number | null): number {
    if (sendDay === null) {
        throw new Error(`A frequência ${frequency} exige o dia do envio`)
    }
    return sendDay
}

// Hoje às 06:00 locais (já passou ou não, conforme a hora atual).
const todayAtSendHour = (local: Date): Date =>
    new Date(
        Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), SEND_HOUR_LOCAL),
    )

function nextDaily(local: Date): Date {
    const candidate = todayAtSendHour(local)
    return candidate > local ? candidate : new Date(candidate.getTime() + DAY_MS)
}

// `sendDay` semanal segue a numeração ISO: 1 = segunda … 7 = domingo.
function nextWeekly(local: Date, isoWeekday: number): Date {
    const today = todayAtSendHour(local)
    const currentIso = today.getUTCDay() === 0 ? 7 : today.getUTCDay()
    const candidate = new Date(today.getTime() + ((isoWeekday - currentIso + 7) % 7) * DAY_MS)
    return candidate > local ? candidate : new Date(candidate.getTime() + 7 * DAY_MS)
}

// Mês mais curto que o dia escolhido envia no último dia do mês, em vez de
// estourar para o mês seguinte (`Date` faria 31 de fevereiro virar 3 de março).
function nextMonthBased(local: Date, months: readonly number[], sendDay: number): Date {
    for (let offset = 0; offset <= 12; offset++) {
        const anchor = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1))
        const year = anchor.getUTCFullYear()
        const month = anchor.getUTCMonth()
        if (!months.includes(month)) continue

        const day = Math.min(sendDay, daysInMonth(year, month))
        const candidate = new Date(Date.UTC(year, month, day, SEND_HOUR_LOCAL))
        if (candidate > local) return candidate
    }
    // Inalcançável: o anual, o mais raro, sempre tem janeiro dentro de 12 meses.
    throw new Error("Não foi possível calcular a próxima execução")
}

/**
 * Próxima execução de uma configuração de envio, estritamente depois de
 * `now`. Função pura, com o relógio como argumento, para a lista de
 * configurações e o cálculo de "próximos envios" usarem a mesma regra.
 *
 * @param frequency - Periodicidade do envio.
 * @param sendDay - Dia do envio: ignorado na diária; 1–7 (segunda a domingo) na semanal; 1–31 nas demais.
 * @param now - Instante de referência.
 * @returns O instante (UTC) da próxima execução, às 06:00 de São Paulo.
 * @throws {Error} Se a frequência exige `sendDay` e ele não veio.
 */
export function computeNextRun(
    frequency: ReportFrequency,
    sendDay: number | null,
    now: Date,
): Date {
    const local = toSaoPauloLocal(now)

    switch (frequency) {
        case "DAILY":
            return fromSaoPauloLocal(nextDaily(local))
        case "WEEKLY":
            return fromSaoPauloLocal(nextWeekly(local, requireDay(frequency, sendDay)))
        default:
            return fromSaoPauloLocal(
                nextMonthBased(
                    local,
                    MONTHS_BY_FREQUENCY[frequency],
                    requireDay(frequency, sendDay),
                ),
            )
    }
}
