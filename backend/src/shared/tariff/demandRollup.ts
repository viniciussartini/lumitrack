// Demanda medida (RN19): a maior potência média em janelas de 15 minutos.
// Esta função calcula UMA janela — o rollup incremental
// (`DemandRollupScheduler`) chama ela a cada minuto novo e mantém o máximo.

const WINDOW_SIZE_MINUTES = 15
const MINUTE_MS = 60 * 1000

export type TrailingReading = {
    minuteStart: Date
    avgPowerW: number
    secondsCovered: number
}

/**
 * Calcula a potência média (ponderada por `secondsCovered`, mesma fórmula de
 * `ConsumptionRepository`/`MeterReadingRepository`) de uma janela de 15
 * minutos terminando em `windowEndMinute`.
 *
 * Retorna `null` quando a janela está incompleta — menos de 15 leituras, um
 * buraco entre elas (medidor offline em parte do intervalo) ou peso total
 * zero. Nunca "preenche" o buraco com zero nem reduz a exigência: uma janela
 * de 3 minutos não pode virar "demanda" e inflar a conta (critério de
 * aceite).
 *
 * @param readings - As leituras mais recentes do medidor, ordenadas DESC por `minuteStart` (índice 0 = mais recente).
 * @param windowEndMinute - O minuto em que a janela termina (inclusive).
 * @param windowSizeMinutes - Tamanho da janela em minutos (RN19 = 15; parametrizado só para teste).
 * @returns A potência média (W) da janela, ou `null` se incompleta.
 */
export function computeTrailingWindowAverage(
    readings: TrailingReading[],
    windowEndMinute: Date,
    windowSizeMinutes: number = WINDOW_SIZE_MINUTES,
): number | null {
    if (readings.length !== windowSizeMinutes) {
        return null
    }

    for (let i = 0; i < windowSizeMinutes; i++) {
        const expected = windowEndMinute.getTime() - i * MINUTE_MS
        if (readings[i]!.minuteStart.getTime() !== expected) {
            return null
        }
    }

    let weightedSum = 0
    let totalWeight = 0
    for (const reading of readings) {
        weightedSum += reading.avgPowerW * reading.secondsCovered
        totalWeight += reading.secondsCovered
    }

    if (totalWeight <= 0) {
        return null
    }

    return weightedSum / totalWeight
}
