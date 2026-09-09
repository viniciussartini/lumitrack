import { Prisma, PrismaClient, type TariffPost } from "@/generated/prisma/client.js"
import type { BucketOrder, Granularity } from "@/modules/consumption/consumption.schema.js"
import { localTsExpr, rangeFilter } from "@/shared/database/timeBucket.js"
import type { PeakWindowConfig } from "@/shared/tariff/tariffPost.js"
import { REFERENCE_REACTIVE_RATIO } from "@/shared/tariff/tariff.service.js"

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

export type ConsumptionByPost = {
    post: TariffPost
    kwhConsumed: number
}

export type MonthlyConsumptionByPost = ConsumptionByPost & {
    monthBucket: Date
}

// Janela horária de apuração de energia reativa excedente — indutivo medido
// das 6h às 24h, capacitivo das 0h às 6h. Diferente da classificação de posto
// ponta/fora-ponta: fixo por hora do dia, sem exceção de fim de semana ou
// feriado.
export type ReactiveWindow = "INDUCTIVE" | "CAPACITIVE"

export type ReactiveEnergyByWindow = {
    window: ReactiveWindow
    excessKvarh: number
}

export type MonthlyReactiveEnergyByWindow = ReactiveEnergyByWindow & {
    monthBucket: Date
}

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

/** Acesso a leituras de medidor agregadas em baldes — somente leitura, via SQL raw. */
export class ConsumptionRepository {
    /** @param prisma - Cliente Prisma usado para as agregações via `$queryRaw`. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Agrega leituras em baldes por granularidade, paginados, com o total de
     * baldes já embutido na mesma consulta.
     *
     * `COUNT(*) OVER ()` conta os grupos ANTES do LIMIT/OFFSET (window function
     * roda depois do GROUP BY e antes do corte de página, na ordem lógica de
     * execução do SQL) — dá o total na mesma query, sem uma segunda varredura.
     *
     * Exceção real, não hipotética: se o LIMIT/OFFSET zera o resultado (página
     * fora do intervalo — ex.: pedir a página 5 de um total de 2), a query
     * não devolve NENHUMA linha, e sem linha não tem onde o `COUNT(*) OVER()`
     * "pendurar" o total. Nesse caso — e só nele, já que sem OFFSET zero linhas
     * já prova zero grupos — cai pro fallback de `countBuckets`, único jeito de
     * não regredir a corretude da paginação (reportar `total: 0` quando na
     * verdade há dado, só que fora da página pedida).
     *
     * @param query filtro (medidor, granularidade, janela), ordenação e página.
     * @returns os itens da página e o total de baldes na janela inteira.
     */
    async findAggregated(
        query: BucketQuery & { order: BucketOrder; skip: number; take: number },
    ): Promise<{ items: ConsumptionBucket[]; total: number }> {
        const { meterId, granularity, from, to, order, skip, take } = query
        const unit = TRUNC_UNIT[granularity]

        const rows = await this.prisma.$queryRaw<
            { bucket: Date; kwh: number; avgpower: number | null; total: bigint | number }[]
        >(
            Prisma.sql`
                SELECT bucket, kwh, avgpower, COUNT(*) OVER () AS total
                FROM (
                    SELECT
                        date_trunc(${unit}, ${localTsExpr()}) AS bucket,
                        SUM("kwhConsumed") AS kwh,
                        SUM("avgPowerW" * "secondsCovered") / NULLIF(SUM("secondsCovered"), 0) AS avgpower
                    FROM "meter_readings"
                    WHERE "meterId" = ${meterId}
                    ${rangeFilter(from, to)}
                    GROUP BY bucket
                ) grouped
                ORDER BY bucket ${ORDER_DIRECTION[order]}
                LIMIT ${take} OFFSET ${skip}
            `,
        )

        if (rows.length === 0) {
            // Sem OFFSET (primeira página), zero linhas já prova zero grupos —
            // só a página fora do intervalo (skip > 0) precisa da contagem
            // separada, já que aí a ausência de linha pode ser só o corte.
            const total =
                skip === 0 ? 0 : await this.countBuckets({ meterId, granularity, from, to })
            return { items: [], total }
        }

        return {
            items: rows.map((r) => ({
                bucketStart: r.bucket,
                kwhConsumed: Number(r.kwh),
                avgPowerW: Number(r.avgpower ?? 0),
            })),
            total: Number(rows[0]!.total),
        }
    }

    /**
     * Conta o total de baldes de uma janela, numa varredura própria.
     *
     * Privado de propósito: só existe como fallback de `findAggregated` para
     * o caso de página fora do intervalo — no caminho comum, o total já vem
     * de lá via `COUNT(*) OVER ()`, sem precisar desta segunda varredura.
     *
     * @param query - Filtro (medidor, granularidade, janela).
     * @returns O total de baldes na janela.
     */
    private async countBuckets(query: BucketQuery): Promise<number> {
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

    /**
     * Agregação mensal restrita aos anos informados — usada só para o
     * cálculo de custo da granularidade "year" com alvo PROPERTY (o piso de
     * disponibilidade é mensal; o custo anual correto é a soma de 12 custos
     * mensais, não o piso aplicado uma vez sobre o total do ano).
     *
     * @param meterId - Id do medidor.
     * @param yearBucketStarts - Valores de `bucket` já retornados por
     * `findAggregated` com granularity="year" — comparados por igualdade
     * direta, sem reconverter fuso horário.
     * @returns Consumo mensal (kWh) de cada mês dentro dos anos informados.
     */
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

    /**
     * Base do endpoint batch (GET /api/consumption/summary) — uma única
     * query para o bucket MAIS RECENTE de vários medidores de uma
     * vez, em vez de uma chamada de `findAggregated` por alvo. `DISTINCT ON`
     * sobre o resultado já agrupado por bucket é o que resolve "1 linha por
     * meterId, a mais recente" sem paginação nem `LIMIT`/`OFFSET` por grupo
     * (Postgres não tem "LIMIT por grupo" nativo fora de window function —
     * `DISTINCT ON` + `ORDER BY meterId, bucket DESC` é o idioma equivalente
     * e mais simples aqui, já que só 1 bucket por medidor é pedido).
     *
     * @param meterIds - Ids dos medidores a agregar.
     * @param granularity - Granularidade do balde.
     * @param from - Início da janela (inclusive), ou `undefined` para sem piso.
     * @param to - Fim da janela (inclusive), ou `undefined` para sem teto.
     * @returns O bucket mais recente de cada medidor.
     */
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

    /**
     * Consumo agregado por posto tarifário — fundação da tarifação binômia
     * do Grupo A, que soma o consumo de cada posto pela tarifa daquele
     * posto. Classificação inteira em SQL (fim de semana, feriado e janela
     * de ponta), nunca em JS: `meter_readings` é a maior tabela do sistema,
     * e puxar linha por linha para classificar no Node inflaria exatamente
     * a consulta que o laudo de desempenho já identifica como a mais cara
     * do produto.
     *
     * `holidayDates` é calculado fora daqui (`shared/time/holidays.ts`) —
     * datas móveis (Carnaval, Sexta-Feira Santa, Corpus Christi) são cálculo,
     * não uma tabela no banco.
     *
     * @param meterId - Id do medidor.
     * @param from - Início da janela (inclusive).
     * @param to - Fim da janela (exclusive).
     * @param peakWindow - Janela de ponta da distribuidora.
     * @param holidayDates - Feriados nacionais que caem dentro da janela.
     * @returns O consumo (kWh) somado por posto — só os postos com alguma leitura aparecem.
     */
    async findKwhByPost(
        meterId: string,
        from: Date,
        to: Date,
        peakWindow: PeakWindowConfig,
        holidayDates: Date[],
    ): Promise<ConsumptionByPost[]> {
        const { peakWindowStartHour, peakWindowEndHour } = peakWindow

        const rows = await this.prisma.$queryRaw<{ post: TariffPost; kwh: number }[]>(
            Prisma.sql`
                SELECT post, SUM(kwh) AS kwh
                FROM (
                    SELECT
                        CASE
                            WHEN EXTRACT(DOW FROM ${localTsExpr()}) IN (0, 6) THEN 'OFF_PEAK'
                            WHEN (${localTsExpr()})::date = ANY(${holidayDates}::date[]) THEN 'OFF_PEAK'
                            WHEN EXTRACT(HOUR FROM ${localTsExpr()}) >= ${peakWindowStartHour}
                                AND EXTRACT(HOUR FROM ${localTsExpr()}) < ${peakWindowEndHour}
                                THEN 'PEAK'
                            ELSE 'OFF_PEAK'
                        END AS post,
                        "kwhConsumed" AS kwh
                    FROM "meter_readings"
                    WHERE "meterId" = ${meterId}
                    ${rangeFilter(from, to)}
                ) classified
                GROUP BY post
            `,
        )

        return rows.map((r) => ({ post: r.post, kwhConsumed: Number(r.kwh) }))
    }

    /**
     * Mesma classificação por posto de `findKwhByPost`, agrupada também por
     * mês (hora local) — usada para calcular o custo anual do Grupo A com
     * 1 query para o intervalo inteiro, em vez de 1 chamada de
     * `findKwhByPost` por mês (o que inflaria a mesma leitura linha-a-linha
     * de `meter_readings` que este módulo evita em todo o resto).
     *
     * @param meterId - Id do medidor.
     * @param from - Início da janela (inclusive).
     * @param to - Fim da janela (exclusive).
     * @param peakWindow - Janela de ponta da distribuidora.
     * @param holidayDates - Feriados nacionais que caem dentro da janela.
     * @returns O consumo (kWh) somado por mês × posto — só combinações com alguma leitura aparecem.
     */
    async findKwhByPostGroupedByMonth(
        meterId: string,
        from: Date,
        to: Date,
        peakWindow: PeakWindowConfig,
        holidayDates: Date[],
    ): Promise<MonthlyConsumptionByPost[]> {
        const { peakWindowStartHour, peakWindowEndHour } = peakWindow

        const rows = await this.prisma.$queryRaw<
            { monthbucket: Date; post: TariffPost; kwh: number }[]
        >(
            Prisma.sql`
                SELECT monthbucket, post, SUM(kwh) AS kwh
                FROM (
                    SELECT
                        date_trunc('month', ${localTsExpr()}) AS monthbucket,
                        CASE
                            WHEN EXTRACT(DOW FROM ${localTsExpr()}) IN (0, 6) THEN 'OFF_PEAK'
                            WHEN (${localTsExpr()})::date = ANY(${holidayDates}::date[]) THEN 'OFF_PEAK'
                            WHEN EXTRACT(HOUR FROM ${localTsExpr()}) >= ${peakWindowStartHour}
                                AND EXTRACT(HOUR FROM ${localTsExpr()}) < ${peakWindowEndHour}
                                THEN 'PEAK'
                            ELSE 'OFF_PEAK'
                        END AS post,
                        "kwhConsumed" AS kwh
                    FROM "meter_readings"
                    WHERE "meterId" = ${meterId}
                    ${rangeFilter(from, to)}
                ) classified
                GROUP BY monthbucket, post
            `,
        )

        return rows.map((r) => ({
            monthBucket: r.monthbucket,
            post: r.post,
            kwhConsumed: Number(r.kwh),
        }))
    }

    /**
     * Excedente de energia reativa por janela horária (indutivo 6h-24h,
     * capacitivo 0h-6h) e por mês, somado inteiramente em SQL — mesmo padrão
     * de `findKwhByPostGroupedByMonth` (1 query para o intervalo inteiro, em
     * vez de 1 por mês). A energia reativa de cada minuto é derivada de
     * `kwhConsumed` e `avgPowerFactor` (o medidor não persiste reativa
     * direto): tratando o minuto como um triângulo de potência,
     * `reativa = ativa × tan(acos(FP))`. `avgPowerFactor` é limitado a
     * [0,01; 1] antes do `ACOS` — a ingestão já garante a faixa [0,1], a
     * cláusula aqui é só defesa contra o polo (FP=0 tornaria a tangente
     * infinita) sem descartar a linha.
     *
     * O excedente é apurado por HORA, não sobre o total do mês: cada hora
     * que exceder a razão de referência (`REFERENCE_REACTIVE_RATIO`) soma seu
     * próprio excedente; uma hora com fator de potência bom nunca compensa
     * uma hora ruim (a norma apura por intervalo, não pela média do mês —
     * apurar só no total do mês subestimaria o excedente sempre que houvesse
     * qualquer variação de FP ao longo do período).
     *
     * @param meterId - Id do medidor.
     * @param from - Início da janela (inclusive).
     * @param to - Fim da janela (exclusive).
     * @returns Excedente de energia reativa (kVArh) somado por mês × janela — só combinações com alguma leitura aparecem.
     */
    async findReactiveEnergyByWindowGroupedByMonth(
        meterId: string,
        from: Date,
        to: Date,
    ): Promise<MonthlyReactiveEnergyByWindow[]> {
        // Alias "reactive_window", não "window" — palavra reservada do
        // Postgres (cláusula OVER/WINDOW), quebraria o SQL.
        const rows = await this.prisma.$queryRaw<
            {
                monthbucket: Date
                reactive_window: ReactiveWindow
                excesskvarh: number
            }[]
        >(
            Prisma.sql`
                SELECT
                    monthbucket,
                    reactive_window,
                    SUM(GREATEST(0, kvarh - kwh * ${REFERENCE_REACTIVE_RATIO})) AS excesskvarh
                FROM (
                    SELECT
                        date_trunc('hour', ${localTsExpr()}) AS hourbucket,
                        date_trunc('month', ${localTsExpr()}) AS monthbucket,
                        CASE
                            WHEN EXTRACT(HOUR FROM ${localTsExpr()}) >= 6 THEN 'INDUCTIVE'
                            ELSE 'CAPACITIVE'
                        END AS reactive_window,
                        SUM("kwhConsumed") AS kwh,
                        SUM("kwhConsumed" * TAN(ACOS(LEAST(GREATEST("avgPowerFactor", 0.01), 1)))) AS kvarh
                    FROM "meter_readings"
                    WHERE "meterId" = ${meterId}
                    ${rangeFilter(from, to)}
                    GROUP BY hourbucket, monthbucket, reactive_window
                ) hourly
                GROUP BY monthbucket, reactive_window
            `,
        )

        return rows.map((r) => ({
            monthBucket: r.monthbucket,
            window: r.reactive_window,
            excessKvarh: Number(r.excesskvarh),
        }))
    }
}
