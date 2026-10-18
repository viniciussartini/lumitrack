// Demanda medida: a maior potência média em janelas de 15 minutos.
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
 * @param windowSizeMinutes - Tamanho da janela em minutos (15 na definição de demanda medida; parametrizado só para teste).
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

const BLOCK_MINUTES = 15
const BLOCKS_PER_DAY = 96

export type DemandDayPoint = {
    /** Minuto em que a janela termina (inclusive): :14, :29, :44 ou :59. */
    windowEnd: Date
    /** Potência média (W) da janela; `null` se ainda não fechou ou está incompleta. */
    avgPowerW: number | null
}

/**
 * As 96 janelas de 15 minutos alinhadas ao quarto de hora de um dia, cada uma
 * calculada pela mesma regra do rollup (`computeTrailingWindowAverage`): 15
 * leituras consecutivas, buraco é ausência, nunca zero. Janela que termina
 * depois do último minuto fechado também é ausência — o dia de hoje ainda não
 * terminou.
 *
 * @param readings - Leituras por minuto do dia, em qualquer ordem.
 * @param dayStart - Instante UTC real da meia-noite local do dia.
 * @param lastClosedMinute - Último minuto já fechado (inclusive).
 * @returns Um ponto por janela, de 00:00 a 23:59 locais.
 */
export function computeDemandDayPoints(
    readings: TrailingReading[],
    dayStart: Date,
    lastClosedMinute: Date,
): DemandDayPoint[] {
    const byMinute = new Map(readings.map((reading) => [reading.minuteStart.getTime(), reading]))

    return Array.from({ length: BLOCKS_PER_DAY }, (_, block): DemandDayPoint => {
        const endMs = dayStart.getTime() + ((block + 1) * BLOCK_MINUTES - 1) * MINUTE_MS
        const windowEnd = new Date(endMs)
        if (endMs > lastClosedMinute.getTime()) return { windowEnd, avgPowerW: null }

        const window: TrailingReading[] = []
        for (let i = 0; i < BLOCK_MINUTES; i++) {
            const reading = byMinute.get(endMs - i * MINUTE_MS)
            if (!reading) return { windowEnd, avgPowerW: null }
            window.push(reading)
        }
        return { windowEnd, avgPowerW: computeTrailingWindowAverage(window, windowEnd) }
    })
}
