import type { TariffPost } from "@/generated/prisma/client.js"

// Sem horário de verão no Brasil desde 2019 (RN26) — América/São_Paulo tem
// deslocamento fixo o ano inteiro. Não há lógica de DST aqui de propósito;
// se o horário de verão voltar, esta premissa precisa ser revisitada.

/** Janela de ponta configurável por distribuidora (RN24). */
export type PeakWindowConfig = {
    peakWindowStartHour: number
    peakWindowEndHour: number
}

function isWeekend(localTimestamp: Date): boolean {
    const day = localTimestamp.getUTCDay()
    return day === 0 || day === 6
}

function isHoliday(localTimestamp: Date, holidays: Date[]): boolean {
    const localDate = localTimestamp.toISOString().slice(0, 10)
    return holidays.some((holiday) => holiday.toISOString().slice(0, 10) === localDate)
}

/**
 * Classifica um instante de consumo em posto tarifário (RN24/RN25) — só
 * `PEAK`/`OFF_PEAK`: `INTERMEDIATE` é exclusivo da Tarifa Branca (Grupo B,
 * Fase 22), que ainda não existe.
 *
 * **Convenção do parâmetro:** `localTimestamp` já deve estar na hora de
 * parede da distribuidora (mesma conversão de `localTsExpr()` em SQL) — os
 * getters UTC do `Date` (`getUTCDay`/`getUTCHours`) são lidos como se fossem
 * a hora local. Passar um instante em UTC bruto aqui reproduziria a
 * armadilha "virada de dia" que este módulo existe para evitar.
 *
 * @param localTimestamp - Instante já convertido para hora local.
 * @param peakWindow - Janela de ponta da distribuidora (RN24).
 * @param holidays - Feriados nacionais do período (RN25) — ver `shared/time/holidays.ts`.
 * @returns O posto tarifário do instante.
 */
export function classifyPost(
    localTimestamp: Date,
    peakWindow: PeakWindowConfig,
    holidays: Date[],
): TariffPost {
    if (isWeekend(localTimestamp) || isHoliday(localTimestamp, holidays)) {
        return "OFF_PEAK"
    }

    const hour = localTimestamp.getUTCHours()
    if (hour >= peakWindow.peakWindowStartHour && hour < peakWindow.peakWindowEndHour) {
        return "PEAK"
    }

    return "OFF_PEAK"
}
