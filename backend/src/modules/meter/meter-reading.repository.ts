import { randomUUID } from "crypto"
import { Prisma, PrismaClient } from "@/generated/prisma/client.js"
import type { MinuteBucketSnapshot } from "@/modules/iot/iot-worker/MinuteBuffer.js"
import type { MeterReadingGranularity } from "@/modules/meter/meter-reading.schema.js"
import { localTsExpr, rangeFilter } from "@/shared/database/timeBucket.js"
import { withPurgeTimeout } from "@/shared/database/withPurgeTimeout.js"

const TRUNC_UNIT: Record<MeterReadingGranularity, string> = {
    minute: "minute",
    hour: "hour",
}

export type MeterReadingBucket = {
    bucketStart: Date
    avgPowerW: number
}

/**
 * Persistência das leituras minuto a minuto (MeterReading). Deliberadamente
 * simples: ao contrário do antigo HourlyRollupScheduler, não resolve
 * hierarquia nem calcula custo — grava só as grandezas elétricas cruas. O
 * custo é calculado sob demanda na agregação (TariffService).
 */
export class MeterReadingRepository {
    /** @param prisma - Cliente Prisma usado para ler e gravar leituras de medidor. */
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
     *
     * @param snapshot - Amostra agregada de um minuto, pronta para persistir.
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
     *
     * @param meterId - Id do medidor.
     * @param granularity - Granularidade dos buckets (minuto ou hora).
     * @param from - Início da janela (inclusive).
     * @param to - Fim da janela (inclusive).
     * @returns Buckets ordenados por início, com a potência média de cada um.
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
     *
     * @param threshold - Leituras com `minuteStart` anterior a este instante são removidas.
     * @returns Quantidade de leituras removidas.
     */
    async deleteOlderThan(threshold: Date): Promise<number> {
        return withPurgeTimeout(this.prisma, async (tx) => {
            const result = await tx.meterReading.deleteMany({
                where: { minuteStart: { lt: threshold } },
            })
            return result.count
        })
    }

    /**
     * Medidores com pelo menos uma leitura na janela — usado por
     * `DemandRollupScheduler` a cada tick para saber quais medidores
     * reprocessar, sem varrer `meter_readings` inteira (índice único tem
     * `meterId` como coluna líder, mas aqui filtramos só por `minuteStart`;
     * o índice de suporte ao expurgo, `meter_readings_minuteStart_idx`,
     * cobre esta consulta).
     *
     * @param from - Início da janela (inclusive).
     * @param to - Fim da janela (inclusive).
     * @returns Ids distintos de medidores com leitura na janela.
     */
    async findMeterIdsWithReadingsSince(from: Date, to: Date): Promise<string[]> {
        const rows = await this.prisma.meterReading.findMany({
            where: { minuteStart: { gte: from, lte: to } },
            select: { meterId: true },
            distinct: ["meterId"],
        })
        return rows.map((r) => r.meterId)
    }

    /**
     * As leituras mais recentes de um medidor até `endMinute`, mais novas
     * primeiro — matéria-prima de `computeTrailingWindowAverage`
     * (`shared/tariff/demandRollup.ts`). Usa o índice único
     * `(meterId, minuteStart)` como coluna líder — sempre um acesso pequeno
     * e indexado, nunca uma varredura da tabela inteira.
     *
     * @param meterId - Id do medidor.
     * @param endMinute - Fim da janela (inclusive) — normalmente o minuto mais recente já persistido.
     * @param count - Quantas leituras buscar (RN19 = 15).
     * @returns As leituras, ordenadas da mais recente para a mais antiga.
     */
    async findTrailingReadings(
        meterId: string,
        endMinute: Date,
        count = 15,
    ): Promise<{ minuteStart: Date; avgPowerW: number; secondsCovered: number }[]> {
        return this.prisma.meterReading.findMany({
            where: { meterId, minuteStart: { lte: endMinute } },
            select: { minuteStart: true, avgPowerW: true, secondsCovered: true },
            orderBy: { minuteStart: "desc" },
            take: count,
        })
    }
}
