import { Prisma, PrismaClient } from "@/generated/prisma/client.js"
import type { MinuteBucketSnapshot } from "@/modules/iot/iot-worker/MinuteBuffer.js"
import type { MeterReadingGranularity } from "@/modules/meter/meter-reading.schema.js"
import { localTsExpr, rangeFilter } from "@/shared/database/timeBucket.js"

const TRUNC_UNIT: Record<MeterReadingGranularity, string> = {
    minute: "minute",
    hour: "hour",
}

export type MeterReadingBucket = {
    bucketStart: Date
    avgPowerW: number
}

// Persistência das leituras minuto a minuto (MeterReading). Deliberadamente
// simples: ao contrário do antigo HourlyRollupScheduler, não resolve
// hierarquia nem calcula custo — grava só as grandezas elétricas cruas. O
// custo é calculado sob demanda na agregação (Fase 3, TariffService).
export class MeterReadingRepository {
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Upsert ponderado por (meterId, minuteStart). Se já existir uma leitura
     * para esse minuto — ex.: o servidor reiniciou no meio do minuto e o
     * scheduler rodou o flush duas vezes — faz merge ponderado por
     * secondsCovered em vez de sobrescrever, preservando as amostras já
     * persistidas (nem perde, nem duplica energia).
     */
    async upsertMinute(snapshot: MinuteBucketSnapshot): Promise<void> {
        const existing = await this.prisma.meterReading.findUnique({
            where: {
                meterId_minuteStart: {
                    meterId: snapshot.meterId,
                    minuteStart: snapshot.minuteStart,
                },
            },
        })

        if (!existing) {
            await this.prisma.meterReading.create({
                data: {
                    meterId: snapshot.meterId,
                    minuteStart: snapshot.minuteStart,
                    kwhConsumed: snapshot.energyKwh,
                    avgVoltage: snapshot.avgVoltage,
                    avgCurrent: snapshot.avgCurrent,
                    avgPowerW: snapshot.avgPowerW,
                    avgPowerFactor: snapshot.avgPowerFactor,
                    sampleCount: snapshot.sampleCount,
                    secondsCovered: snapshot.secondsCovered,
                },
            })
            return
        }

        // Combina duas médias ponderadas: soma (média × peso) de cada lado e
        // divide pela soma dos pesos (secondsCovered). Energia e sampleCount
        // apenas somam — não são médias.
        const totalSeconds = existing.secondsCovered + snapshot.secondsCovered
        const weighted = (existingAvg: number, newAvg: number): number =>
            totalSeconds > 0
                ? (existingAvg * existing.secondsCovered + newAvg * snapshot.secondsCovered) /
                  totalSeconds
                : newAvg

        await this.prisma.meterReading.update({
            where: { id: existing.id },
            data: {
                kwhConsumed: existing.kwhConsumed + snapshot.energyKwh,
                avgVoltage: weighted(existing.avgVoltage, snapshot.avgVoltage),
                avgCurrent: weighted(existing.avgCurrent, snapshot.avgCurrent),
                avgPowerW: weighted(existing.avgPowerW, snapshot.avgPowerW),
                avgPowerFactor: weighted(existing.avgPowerFactor, snapshot.avgPowerFactor),
                sampleCount: existing.sampleCount + snapshot.sampleCount,
                secondsCovered: totalSeconds,
            },
        })
    }

    /**
     * Agrega leituras por minuto/hora numa janela — usada pelo gráfico "ao
     * vivo" (issue #211), não pelo faturamento (isso é `ConsumptionRepository`).
     * `avgPowerW` ponderado por `secondsCovered`, mesma receita de
     * `ConsumptionRepository.findAggregated` — sem soma de kWh nem
     * paginação, só a grandeza que o gráfico plota.
     */
    async findAggregated(
        meterId: string,
        granularity: MeterReadingGranularity,
        from: Date,
        to: Date,
    ): Promise<MeterReadingBucket[]> {
        const unit = TRUNC_UNIT[granularity]

        const rows = await this.prisma.$queryRaw<{ bucket: Date; avgpower: number | null }[]>(
            Prisma.sql`
                SELECT
                    date_trunc(${unit}, ${localTsExpr()}) AS bucket,
                    SUM("avgPowerW" * "secondsCovered") / NULLIF(SUM("secondsCovered"), 0) AS avgpower
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                ${rangeFilter(from, to)}
                GROUP BY bucket
                ORDER BY bucket ASC
            `,
        )

        return rows.map((r) => ({
            bucketStart: r.bucket,
            avgPowerW: Number(r.avgpower ?? 0),
        }))
    }

    /**
     * Expurgo por retenção (Fase 15, issue #267) — remove leituras mais
     * antigas que `threshold` por `minuteStart` (não `createdAt`): é o
     * instante da leitura em si que define a janela de retenção, não quando
     * a linha foi persistida. Suportado por `meter_readings_minuteStart_idx`
     * (issue #278).
     */
    async deleteOlderThan(threshold: Date): Promise<number> {
        const result = await this.prisma.meterReading.deleteMany({
            where: { minuteStart: { lt: threshold } },
        })
        return result.count
    }
}
