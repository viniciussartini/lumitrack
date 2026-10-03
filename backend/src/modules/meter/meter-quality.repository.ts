import { Prisma, PrismaClient } from "@/generated/prisma/client.js"
import {
    POWER_QUALITY_QUANTITIES,
    type PowerQualityDailyRow,
    type PowerQualityStat,
    type PowerQualityStats,
} from "@/modules/meter/meter-quality.js"
import { localTsExpr, rangeFilter } from "@/shared/database/timeBucket.js"

const column = (name: string): Prisma.Sql => Prisma.raw(`"${name}"`)

// Média das fases presentes numa linha (uma coluna, ou as três fases); nula
// quando nenhuma foi reportada — ausência não vira zero.
function rowMean(columns: readonly string[]): Prisma.Sql {
    const present = columns.map((name) => Prisma.sql`(${column(name)} IS NOT NULL)::int`)
    const sum = columns.map((name) => Prisma.sql`COALESCE(${column(name)}, 0)`)
    return Prisma.sql`(${Prisma.join(sum, " + ")}) / NULLIF(${Prisma.join(present, " + ")}, 0)`
}

// Média ponderada por `secondsCovered`, a mesma convenção das demais agregações
// de `meter_readings`; linhas sem a grandeza não entram no peso.
function weightedAvg(value: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`SUM(${value} * "secondsCovered")
        / NULLIF(SUM(CASE WHEN ${value} IS NULL THEN NULL ELSE "secondsCovered" END), 0)`
}

const num = (value: number | null): number | null => (value === null ? null : Number(value))

/** Estatísticas de qualidade de energia de `meter_readings`. */
export class MeterQualityRepository {
    /** @param prisma - Cliente Prisma do processo. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Mínimo, média e máximo de cada grandeza por fase no período, e a média
     * diária de cada grandeza (dias locais de São Paulo).
     *
     * @param meterId - Id do medidor.
     * @param from - Início da janela (inclusive).
     * @param to - Fim da janela (exclusive).
     * @returns As estatísticas; sem leituras, tudo nulo e nenhum dia.
     */
    async findStats(meterId: string, from: Date, to: Date): Promise<PowerQualityStats> {
        const [period, daily] = await Promise.all([
            this.findPeriodStats(meterId, from, to),
            this.findDailyAverages(meterId, from, to),
        ])
        return { period, daily }
    }

    private async findPeriodStats(
        meterId: string,
        from: Date,
        to: Date,
    ): Promise<Record<string, PowerQualityStat>> {
        const columns = POWER_QUALITY_QUANTITIES.flatMap((quantity) => quantity.columns)
        const selects = columns.flatMap((name, i) => {
            const value = column(name)
            return [
                Prisma.sql`MIN(${value}) FILTER (WHERE "secondsCovered" > 0) AS ${Prisma.raw(`min_${i}`)}`,
                Prisma.sql`${weightedAvg(value)} AS ${Prisma.raw(`avg_${i}`)}`,
                Prisma.sql`MAX(${value}) FILTER (WHERE "secondsCovered" > 0) AS ${Prisma.raw(`max_${i}`)}`,
            ]
        })

        const rows = await this.prisma.$queryRaw<Record<string, number | null>[]>(
            Prisma.sql`
                SELECT ${Prisma.join(selects)}
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                ${rangeFilter(from, to)}
            `,
        )

        const row = rows[0] ?? {}
        return Object.fromEntries(
            columns.map((name, i) => [
                name,
                {
                    min: num(row[`min_${i}`] ?? null),
                    avg: num(row[`avg_${i}`] ?? null),
                    max: num(row[`max_${i}`] ?? null),
                },
            ]),
        )
    }

    private async findDailyAverages(
        meterId: string,
        from: Date,
        to: Date,
    ): Promise<PowerQualityDailyRow[]> {
        const selects = POWER_QUALITY_QUANTITIES.map(
            (quantity, i) =>
                Prisma.sql`${weightedAvg(rowMean(quantity.columns))} AS ${Prisma.raw(`q_${i}`)}`,
        )

        const rows = await this.prisma.$queryRaw<
            ({ bucket: Date } & Record<string, number | Date | null>)[]
        >(
            Prisma.sql`
                SELECT date_trunc('day', ${localTsExpr()}) AS bucket, ${Prisma.join(selects)}
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                ${rangeFilter(from, to)}
                GROUP BY bucket
                ORDER BY bucket ASC
            `,
        )

        return rows.map((row) => ({
            day: row.bucket,
            averages: Object.fromEntries(
                POWER_QUALITY_QUANTITIES.map((quantity, i) => [
                    quantity.key,
                    num((row[`q_${i}`] ?? null) as number | null),
                ]),
            ),
        }))
    }
}
