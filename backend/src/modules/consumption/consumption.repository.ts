import { Prisma, PrismaClient } from "@/generated/prisma/client.js"
import type { BucketOrder, Granularity } from "@/modules/consumption/consumption.schema.js"
import { localTsExpr, rangeFilter } from "@/shared/database/timeBucket.js"

// Whitelist explícita do argumento de date_trunc — o valor já vem validado
// pelo zod (enum fechado), mas mapear em vez de interpolar a string do
// usuário direto é uma segunda camada de defesa (SQL raw + input externo).
const TRUNC_UNIT: Record<Granularity, string> = {
    minute: "minute",
    hour: "hour",
    day: "day",
    month: "month",
    year: "year",
}

// Mesma defesa do TRUNC_UNIT: `ORDER BY` não aceita parâmetro vinculado, então
// a direção entra como SQL literal — e só a partir deste mapa fechado.
const ORDER_DIRECTION: Record<BucketOrder, Prisma.Sql> = {
    asc: Prisma.sql`ASC`,
    desc: Prisma.sql`DESC`,
}

export type ConsumptionBucket = {
    bucketStart: Date
    kwhConsumed: number
    avgPowerW: number
}

export type MonthlyKwhForYear = {
    yearBucket: Date
    monthBucket: Date
    kwhConsumed: number
}

export type LatestBucketForMeter = ConsumptionBucket & { meterId: string }

/**
 * Recorte comum das duas agregações: qual medidor, que bucket, que janela.
 * `from`/`to` são explicitamente `Date | undefined` (e não opcionais) porque
 * a janela sempre vem do schema, com ou sem valor — `exactOptionalPropertyTypes`
 * distingue "chave ausente" de "chave com undefined".
 */
export type BucketQuery = {
    meterId: string
    granularity: Granularity
    from: Date | undefined
    to: Date | undefined
}

export class ConsumptionRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findAggregated(
        query: BucketQuery & { order: BucketOrder; skip: number; take: number },
    ): Promise<ConsumptionBucket[]> {
        const { meterId, granularity, from, to, order, skip, take } = query
        const unit = TRUNC_UNIT[granularity]

        const rows = await this.prisma.$queryRaw<
            { bucket: Date; kwh: number; avgpower: number | null }[]
        >(
            Prisma.sql`
                SELECT
                    date_trunc(${unit}, ${localTsExpr()}) AS bucket,
                    SUM("kwhConsumed") AS kwh,
                    SUM("avgPowerW" * "secondsCovered") / NULLIF(SUM("secondsCovered"), 0) AS avgpower
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                ${rangeFilter(from, to)}
                GROUP BY bucket
                ORDER BY bucket ${ORDER_DIRECTION[order]}
                LIMIT ${take} OFFSET ${skip}
            `,
        )

        return rows.map((r) => ({
            bucketStart: r.bucket,
            kwhConsumed: Number(r.kwh),
            avgPowerW: Number(r.avgpower ?? 0),
        }))
    }

    async countBuckets(query: BucketQuery): Promise<number> {
        const { meterId, granularity, from, to } = query
        const unit = TRUNC_UNIT[granularity]

        const rows = await this.prisma.$queryRaw<{ count: bigint | number }[]>(
            Prisma.sql`
                SELECT COUNT(*) AS count FROM (
                    SELECT date_trunc(${unit}, ${localTsExpr()}) AS bucket
                    FROM "meter_readings"
                    WHERE "meterId" = ${meterId}
                    ${rangeFilter(from, to)}
                    GROUP BY bucket
                ) sub
            `,
        )

        return Number(rows[0]?.count ?? 0)
    }

    // Agregação mensal restrita aos anos informados — usada só para o
    // cálculo de custo da granularidade "year" com alvo PROPERTY (o piso de
    // disponibilidade é mensal; o custo anual correto é a soma de 12 custos
    // mensais, não o piso aplicado uma vez sobre o total do ano).
    // `yearBucketStarts` são exatamente os valores de `bucket` já retornados
    // por `findAggregated` com granularity="year" — comparação por
    // igualdade direta, sem reconverter fuso horário.
    async findMonthlyKwhForYears(
        meterId: string,
        yearBucketStarts: Date[],
    ): Promise<MonthlyKwhForYear[]> {
        if (yearBucketStarts.length === 0) return []

        const rows = await this.prisma.$queryRaw<
            { yearbucket: Date; monthbucket: Date; kwh: number }[]
        >(
            Prisma.sql`
                SELECT
                    date_trunc('year', ${localTsExpr()}) AS yearbucket,
                    date_trunc('month', ${localTsExpr()}) AS monthbucket,
                    SUM("kwhConsumed") AS kwh
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                    AND date_trunc('year', ${localTsExpr()}) = ANY(${yearBucketStarts}::timestamp[])
                GROUP BY yearbucket, monthbucket
            `,
        )

        return rows.map((r) => ({
            yearBucket: r.yearbucket,
            monthBucket: r.monthbucket,
            kwhConsumed: Number(r.kwh),
        }))
    }

    // Base do endpoint batch (GET /api/consumption/summary) — uma única
    // query para o bucket MAIS RECENTE de vários medidores de uma
    // vez, em vez de uma chamada de `findAggregated` por alvo. `DISTINCT ON`
    // sobre o resultado já agrupado por bucket é o que resolve "1 linha por
    // meterId, a mais recente" sem paginação nem `LIMIT`/`OFFSET` por grupo
    // (Postgres não tem "LIMIT por grupo" nativo fora de window function —
    // `DISTINCT ON` + `ORDER BY meterId, bucket DESC` é o idioma equivalente
    // e mais simples aqui, já que só 1 bucket por medidor é pedido).
    async findLatestAggregatedForMeters(
        meterIds: string[],
        granularity: Granularity,
        from: Date | undefined,
        to: Date | undefined,
    ): Promise<LatestBucketForMeter[]> {
        if (meterIds.length === 0) return []
        const unit = TRUNC_UNIT[granularity]

        const rows = await this.prisma.$queryRaw<
            { meterid: string; bucket: Date; kwh: number; avgpower: number | null }[]
        >(
            Prisma.sql`
                SELECT DISTINCT ON ("meterId")
                    "meterId" AS meterid, bucket, kwh, avgpower
                FROM (
                    SELECT
                        "meterId",
                        date_trunc(${unit}, ${localTsExpr()}) AS bucket,
                        SUM("kwhConsumed") AS kwh,
                        SUM("avgPowerW" * "secondsCovered") / NULLIF(SUM("secondsCovered"), 0) AS avgpower
                    FROM "meter_readings"
                    WHERE "meterId" = ANY(${meterIds}::text[])
                    ${rangeFilter(from, to)}
                    GROUP BY "meterId", bucket
                ) sub
                ORDER BY "meterId", bucket DESC
            `,
        )

        return rows.map((r) => ({
            meterId: r.meterid,
            bucketStart: r.bucket,
            kwhConsumed: Number(r.kwh),
            avgPowerW: Number(r.avgpower ?? 0),
        }))
    }
}
