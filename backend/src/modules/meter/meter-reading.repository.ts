import { randomUUID } from "crypto"
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
// custo é calculado sob demanda na agregação (TariffService).
export class MeterReadingRepository {
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Upsert ponderado por (meterId, minuteStart). Se já existir uma leitura
     * para esse minuto — ex.: o servidor reiniciou no meio do minuto e o
     * scheduler rodou o flush duas vezes — faz merge ponderado por
     * secondsCovered em vez de sobrescrever, preservando as amostras já
     * persistidas (nem perde, nem duplica energia).
     *
     * `INSERT ... ON CONFLICT DO UPDATE` atômico, não check-then-write:
     * duas chamadas concorrentes para o mesmo (meterId, minuteStart) — ex.
     * dois flushes do `MinuteBuffer` disparando quase juntos — faziam
     * `findUnique` e as duas viam "não existe", e a segunda `create()`
     * falhava por violar a constraint única (`meterId_minuteStart`). A
     * média ponderada só pode ser expressa dentro do próprio SQL porque
     * depende do valor JÁ PERSISTIDO no exato momento do conflito —
     * calculá-la no client antes de saber se há conflito (como o `upsert()`
     * nativo do Prisma faria) reintroduziria a mesma corrida. `EXCLUDED`
     * refere-se à linha que esta chamada tentou inserir; `"meter_readings"`
     * (sem alias) refere-se à linha já existente antes deste conflito.
     */
    async upsertMinute(snapshot: MinuteBucketSnapshot): Promise<void> {
        await this.prisma.$executeRaw`
            INSERT INTO "meter_readings" (
                "id", "meterId", "minuteStart", "kwhConsumed", "avgVoltage", "avgCurrent",
                "avgPowerW", "avgPowerFactor", "sampleCount", "secondsCovered", "updatedAt"
            )
            VALUES (
                ${randomUUID()}, ${snapshot.meterId}, ${snapshot.minuteStart},
                ${snapshot.energyKwh}, ${snapshot.avgVoltage}, ${snapshot.avgCurrent},
                ${snapshot.avgPowerW}, ${snapshot.avgPowerFactor}, ${snapshot.sampleCount},
                ${snapshot.secondsCovered}, now()
            )
            ON CONFLICT ("meterId", "minuteStart") DO UPDATE SET
                "kwhConsumed" = "meter_readings"."kwhConsumed" + EXCLUDED."kwhConsumed",
                "avgVoltage" = CASE
                    WHEN "meter_readings"."secondsCovered" + EXCLUDED."secondsCovered" > 0 THEN
                        ("meter_readings"."avgVoltage" * "meter_readings"."secondsCovered"
                            + EXCLUDED."avgVoltage" * EXCLUDED."secondsCovered")
                        / ("meter_readings"."secondsCovered" + EXCLUDED."secondsCovered")
                    ELSE EXCLUDED."avgVoltage"
                END,
                "avgCurrent" = CASE
                    WHEN "meter_readings"."secondsCovered" + EXCLUDED."secondsCovered" > 0 THEN
                        ("meter_readings"."avgCurrent" * "meter_readings"."secondsCovered"
                            + EXCLUDED."avgCurrent" * EXCLUDED."secondsCovered")
                        / ("meter_readings"."secondsCovered" + EXCLUDED."secondsCovered")
                    ELSE EXCLUDED."avgCurrent"
                END,
                "avgPowerW" = CASE
                    WHEN "meter_readings"."secondsCovered" + EXCLUDED."secondsCovered" > 0 THEN
                        ("meter_readings"."avgPowerW" * "meter_readings"."secondsCovered"
                            + EXCLUDED."avgPowerW" * EXCLUDED."secondsCovered")
                        / ("meter_readings"."secondsCovered" + EXCLUDED."secondsCovered")
                    ELSE EXCLUDED."avgPowerW"
                END,
                "avgPowerFactor" = CASE
                    WHEN "meter_readings"."secondsCovered" + EXCLUDED."secondsCovered" > 0 THEN
                        ("meter_readings"."avgPowerFactor" * "meter_readings"."secondsCovered"
                            + EXCLUDED."avgPowerFactor" * EXCLUDED."secondsCovered")
                        / ("meter_readings"."secondsCovered" + EXCLUDED."secondsCovered")
                    ELSE EXCLUDED."avgPowerFactor"
                END,
                "sampleCount" = "meter_readings"."sampleCount" + EXCLUDED."sampleCount",
                "secondsCovered" = "meter_readings"."secondsCovered" + EXCLUDED."secondsCovered",
                "updatedAt" = now()
        `
    }

    /**
     * Agrega leituras por minuto/hora numa janela — usada pelo gráfico "ao
     * vivo", não pelo faturamento (isso é `ConsumptionRepository`).
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
     * Expurgo por retenção — remove leituras mais antigas que `threshold`
     * por `minuteStart` (não `createdAt`): é o instante da leitura em si que
     * define a janela de retenção, não quando a linha foi persistida.
     * Suportado pelo índice `meter_readings_minuteStart_idx`.
     */
    async deleteOlderThan(threshold: Date): Promise<number> {
        const result = await this.prisma.meterReading.deleteMany({
            where: { minuteStart: { lt: threshold } },
        })
        return result.count
    }
}
