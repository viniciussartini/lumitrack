import type { TariffPost } from "@/generated/prisma/client.js"

// Sem horário de verão no Brasil desde 2019 — América/São_Paulo tem
// deslocamento fixo o ano inteiro. Não há lógica de DST aqui de propósito;
// se o horário de verão voltar, esta premissa precisa ser revisitada.

/** Janela de ponta — configurável por distribuidora porque varia por local/estado. */
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

/** As duas horas-relógio (0–23) do posto Intermediário — exclusivo da Tarifa Branca (Grupo B). */
export type IntermediateHours = {
    hourBeforePeak: number
    hourAfterPeak: number
}

/**
 * Deriva as horas do posto Intermediário a partir da janela de ponta: a 1h
 * imediatamente antes do início e a 1h imediatamente depois do fim (mesma
 * aritmética usada pela função pura e pelas duas queries SQL de agregação —
 * centralizada aqui para as três não desalinharem entre si).
 *
 * @param peakWindow - Janela de ponta da distribuidora.
 * @returns As horas-relógio do Intermediário, com aritmética modular (24h).
 */
export function getIntermediateHours(peakWindow: PeakWindowConfig): IntermediateHours {
    return {
        hourBeforePeak: (peakWindow.peakWindowStartHour + 23) % 24,
        hourAfterPeak: peakWindow.peakWindowEndHour % 24,
    }
}

/**
 * Classifica um instante de consumo em posto tarifário. `includeIntermediate`
 * é opt-in (default `false`) — a mesma hora-relógio que é `INTERMEDIATE` para
 * a Tarifa Branca (Grupo B) é `OFF_PEAK` para o Grupo A, que não tem tarifa
 * cadastrada para esse posto em nenhuma modalidade (Verde/Azul). Sem o opt-in
 * explícito, o comportamento é idêntico ao de antes deste posto existir —
 * nenhum chamador do Grupo A precisa mudar para continuar correto. Fim de
 * semana e feriado contam integralmente como fora de ponta, com ou sem
 * `INTERMEDIATE` habilitado.
 *
 * **Convenção do parâmetro:** `localTimestamp` já deve estar na hora de
 * parede da distribuidora (mesma conversão de `localTsExpr()` em SQL) — os
 * getters UTC do `Date` (`getUTCDay`/`getUTCHours`) são lidos como se fossem
 * a hora local. Passar um instante em UTC bruto aqui reproduziria a
 * armadilha "virada de dia" que este módulo existe para evitar.
 *
 * @param localTimestamp - Instante já convertido para hora local.
 * @param peakWindow - Janela de ponta da distribuidora.
 * @param holidays - Feriados nacionais do período — ver `shared/time/holidays.ts`.
 * @param includeIntermediate - Habilita o posto `INTERMEDIATE` (Tarifa Branca). Default `false`.
 * @returns O posto tarifário do instante.
 */
export function classifyPost(
    localTimestamp: Date,
    peakWindow: PeakWindowConfig,
    holidays: Date[],
    includeIntermediate = false,
): TariffPost {
    if (isWeekend(localTimestamp) || isHoliday(localTimestamp, holidays)) {
        return "OFF_PEAK"
    }

    const hour = localTimestamp.getUTCHours()
    if (hour >= peakWindow.peakWindowStartHour && hour < peakWindow.peakWindowEndHour) {
        return "PEAK"
    }

    if (includeIntermediate) {
        const { hourBeforePeak, hourAfterPeak } = getIntermediateHours(peakWindow)
        if (hour === hourBeforePeak || hour === hourAfterPeak) {
            return "INTERMEDIATE"
        }
    }

    return "OFF_PEAK"
}
