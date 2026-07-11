import { Prisma, PrismaClient } from "@/generated/prisma/client.js"
import type { Granularity } from "@/modules/consumption/consumption.schema.js"

// Whitelist explícita do argumento de date_trunc — o valor já vem validado
// pelo zod (enum fechado), mas mapear em vez de interpolar a string do
// usuário direto é uma segunda camada de defesa (SQL raw + input externo).
const TRUNC_UNIT: Record<Granularity, string> = {
    hour: "hour",
    day: "day",
    month: "month",
    year: "year",
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

// `("minuteStart" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'` é o
// idioma padrão do Postgres para converter um timestamp SEM fuso (nossa
// coluna `minuteStart`, que guarda o instante de recebimento em UTC) para o
// horário de parede de São Paulo: a primeira conversão marca o valor como
// UTC (produz timestamptz), a segunda projeta esse instante para o fuso de
// SP (produz de volta um timestamp sem fuso, agora com os dígitos em hora
// local). Sem isso, o "dia" viraria às 21h/24h (UTC-3) em vez de meia-noite.
function localTsExpr(): Prisma.Sql {
    return Prisma.sql`(("minuteStart" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')`
}

function rangeFilter(from: Date | undefined, to: Date | undefined): Prisma.Sql {
    const conditions: Prisma.Sql[] = []
    if (from) conditions.push(Prisma.sql`"minuteStart" >= ${from}`)
    if (to) conditions.push(Prisma.sql`"minuteStart" < ${to}`)
    if (conditions.length === 0) return Prisma.empty
    return Prisma.sql`AND ${Prisma.join(conditions, " AND ")}`
}

export class ConsumptionRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findAggregated(
        meterId: string,
        granularity: Granularity,
        from: Date | undefined,
        to: Date | undefined,
        skip: number,
        take: number,
    ): Promise<ConsumptionBucket[]> {
        const unit = TRUNC_UNIT[granularity]

        const rows = await this.prisma.$queryRaw<{ bucket: Date; kwh: number; avgpower: number | null }[]>(
            Prisma.sql`
                SELECT
                    date_trunc(${unit}, ${localTsExpr()}) AS bucket,
                    SUM("kwhConsumed") AS kwh,
                    SUM("avgPowerW" * "secondsCovered") / NULLIF(SUM("secondsCovered"), 0) AS avgpower
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                ${rangeFilter(from, to)}
                GROUP BY bucket
                ORDER BY bucket DESC
                LIMIT ${take} OFFSET ${skip}
            `,
        )

        return rows.map((r) => ({
            bucketStart: r.bucket,
            kwhConsumed: Number(r.kwh),
            avgPowerW: Number(r.avgpower ?? 0),
        }))
    }

    async countBuckets(
        meterId: string,
        granularity: Granularity,
        from: Date | undefined,
        to: Date | undefined,
    ): Promise<number> {
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
    async findMonthlyKwhForYears(meterId: string, yearBucketStarts: Date[]): Promise<MonthlyKwhForYear[]> {
        if (yearBucketStarts.length === 0) return []

        const rows = await this.prisma.$queryRaw<{ yearbucket: Date; monthbucket: Date; kwh: number }[]>(
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

        return rows.map((r) => ({ yearBucket: r.yearbucket, monthBucket: r.monthbucket, kwhConsumed: Number(r.kwh) }))
    }
}
