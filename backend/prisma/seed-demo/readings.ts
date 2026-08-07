import { Prisma } from "@/generated/prisma/client.js"
import { AlertTriggerEventRepository } from "@/modules/alert/alert-trigger-event.repository.js"
import { prisma } from "@/shared/database/prisma.js"
import { anomalyMultiplierAt, type AnomalyMeterKey } from "./anomalies.js"
import { READINGS_BATCH_SIZE, SEED_WINDOW_END_UTC, SEED_WINDOW_START_UTC } from "./constants.js"
import { createRng, generateMinuteReading, type MeterProfileKey } from "./consumptionGen.js"

const alertTriggerEventRepository = new AlertTriggerEventRepository(prisma)

// Seeds fixas por papel de medidor (não pelo `meterId`, que é um UUID gerado
// a cada execução) — é isso que garante que rodar o script 2x produza os
// MESMOS valores de consumo, não só a mesma contagem de linhas.
const RNG_SEEDS: Record<string, number> = {
    residential: 20_250_711,
    commercialGeneral: 20_250_712,
    salesArea: 20_250_713,
    oven: 20_250_714,
}

export interface MeterGenerationSpec {
    rngSeedKey: keyof typeof RNG_SEEDS
    meterId: string
    profile: MeterProfileKey
    // Só medidores com Alert configurado (ver alerts.ts) participam da
    // injeção de anomalia + geração de AlertTriggerEvent.
    anomaly?: { meterKey: AnomalyMeterKey; alertId: string }
}

const ONE_MINUTE_MS = 60_000

/** Gera 1 ano de MeterReading (grão de minuto) para cada medidor da lista, em lotes. */
export async function generateYearOfReadings(specs: MeterGenerationSpec[]): Promise<void> {
    for (const spec of specs) {
        await generateReadingsForMeter(spec)
    }
}

async function generateReadingsForMeter(spec: MeterGenerationSpec): Promise<void> {
    const rng = createRng(RNG_SEEDS[spec.rngSeedKey])
    let batch: Prisma.MeterReadingCreateManyInput[] = []

    // Acumulador do episódio de anomalia em andamento (se houver) — flushado
    // como um único `AlertTriggerEvent` assim que a janela termina.
    let episodeStartedAt: Date | null = null
    let episodeMinPowerW = Infinity
    let episodeMaxPowerW = -Infinity
    let episodeSumPowerW = 0
    let episodeMinuteCount = 0

    const flushEpisode = async (endedAt: Date): Promise<void> => {
        if (!episodeStartedAt || !spec.anomaly) return

        await alertTriggerEventRepository.create({
            alertId: spec.anomaly.alertId,
            startedAt: episodeStartedAt,
            endedAt,
            durationSeconds: episodeMinuteCount * 60,
            minPowerW: episodeMinPowerW,
            maxPowerW: episodeMaxPowerW,
            avgPowerW: episodeSumPowerW / episodeMinuteCount,
            // O seed só retém agregados por minuto (sem amostras por
            // segundo) — aproximamos sampleCount como 1 amostra/s dentro da
            // janela, mesma cadência de publicação do medidor real (~1Hz).
            sampleCount: episodeMinuteCount * 60,
        })

        episodeStartedAt = null
        episodeMinPowerW = Infinity
        episodeMaxPowerW = -Infinity
        episodeSumPowerW = 0
        episodeMinuteCount = 0
    }

    for (
        let minuteStart = new Date(SEED_WINDOW_START_UTC);
        minuteStart.getTime() <= SEED_WINDOW_END_UTC.getTime();
        minuteStart = new Date(minuteStart.getTime() + ONE_MINUTE_MS)
    ) {
        const anomalyMultiplier = spec.anomaly
            ? anomalyMultiplierAt(spec.anomaly.meterKey, minuteStart)
            : 1
        const reading = generateMinuteReading(spec.profile, minuteStart, rng, anomalyMultiplier)

        batch.push({
            meterId: spec.meterId,
            minuteStart,
            kwhConsumed: reading.kwhConsumed,
            avgVoltage: reading.avgVoltage,
            avgCurrent: reading.avgCurrent,
            avgPowerW: reading.avgPowerW,
            avgPowerFactor: reading.avgPowerFactor,
            sampleCount: 60,
            secondsCovered: 60,
        })

        if (anomalyMultiplier > 1) {
            episodeStartedAt ??= minuteStart
            episodeMinPowerW = Math.min(episodeMinPowerW, reading.avgPowerW)
            episodeMaxPowerW = Math.max(episodeMaxPowerW, reading.avgPowerW)
            episodeSumPowerW += reading.avgPowerW
            episodeMinuteCount += 1
        } else if (episodeStartedAt) {
            await flushEpisode(minuteStart)
        }

        if (batch.length >= READINGS_BATCH_SIZE) {
            await prisma.meterReading.createMany({ data: batch, skipDuplicates: true })
            batch = []
        }
    }

    if (batch.length > 0) {
        await prisma.meterReading.createMany({ data: batch, skipDuplicates: true })
    }
    // Defensivo: só dispara se uma janela de anomalia terminasse exatamente
    // no último minuto da série (nenhuma das 6 janelas configuradas faz isso).
    if (episodeStartedAt) {
        await flushEpisode(new Date(SEED_WINDOW_END_UTC.getTime() + ONE_MINUTE_MS))
    }
}
