import { randomUUID } from "crypto"
import { Prisma, PrismaClient } from "@/generated/prisma/client.js"
import type { MinuteBucketSnapshot } from "@/modules/iot/iot-worker/MinuteBuffer.js"
import { OPTIONAL_ELECTRICAL_FIELD_MAP } from "@/modules/meter/meter-reading-optional-fields.js"
import type {
    MeterReadingGranularity,
    MeterReadingSeriesAggregationMinutes,
    MeterReadingSeriesMetric,
    MeterReadingSeriesWindow,
} from "@/modules/meter/meter-reading.schema.js"
import type { SeriesBucketValues } from "@/modules/meter/meter-reading-series-window.js"
import { localTsExpr, rangeFilter } from "@/shared/database/timeBucket.js"
import { withPurgeTimeout } from "@/shared/database/withPurgeTimeout.js"

// Nomes das 22 colunas de grandezas por fase (ADR-0022) — usados para gerar
// as cláusulas SQL do upsert abaixo em vez de escrevê-las 22 vezes à mão.
const OPTIONAL_AVG_FIELDS = OPTIONAL_ELECTRICAL_FIELD_MAP.map(([, avgField]) => avgField)

function quotedColumn(name: string): Prisma.Sql {
    return Prisma.raw(`"${name}"`)
}

/**
 * Cláusula `SET` do merge ponderado de uma grandeza opcional. Mesma receita
 * das 4 grandezas obrigatórias (média ponderada por `secondsCovered`), com
 * dois desvios exigidos pela nulabilidade: se o snapshot novo não trouxe a
 * grandeza, mantém o valor já persistido (não apaga histórico por causa de
 * uma leitura que simplesmente não reportou aquele campo); se o valor já
 * persistido é nulo (linha ainda não tinha essa grandeza), adota o novo
 * direto, sem fazer conta com nulo.
 *
 * @param avgField - Nome da coluna de média (ex.: `avgVoltagePhaseA`).
 * @returns O fragmento SQL `"coluna" = CASE ... END` pronto para o `ON CONFLICT DO UPDATE SET`.
 */
function optionalMergeClause(avgField: string): Prisma.Sql {
    const column = quotedColumn(avgField)
    return Prisma.sql`${column} = CASE
                WHEN EXCLUDED.${column} IS NULL THEN "meter_readings".${column}
                WHEN "meter_readings".${column} IS NULL THEN EXCLUDED.${column}
                WHEN "meter_readings"."secondsCovered" + EXCLUDED."secondsCovered" > 0 THEN
                    ("meter_readings".${column} * "meter_readings"."secondsCovered"
                        + EXCLUDED.${column} * EXCLUDED."secondsCovered")
                    / ("meter_readings"."secondsCovered" + EXCLUDED."secondsCovered")
                ELSE EXCLUDED.${column}
            END`
}

const TRUNC_UNIT: Record<MeterReadingGranularity, string> = {
    minute: "minute",
    hour: "hour",
}

// As 7 grandezas do seletor de série com coluna própria em `meter_readings`
// — sobra tensão/corrente/potência já existentes desde antes do ADR-0022,
// mais as 3 novas que não são por fase (reativa, aparente, frequência).
// `thdv`/`thdi` ficam fora: só existem por fase, então viram uma expressão
// calculada em `metricValueExpr`, não uma coluna direta.
const DIRECT_SERIES_METRIC_COLUMNS: Record<
    Exclude<MeterReadingSeriesMetric, "thdv" | "thdi">,
    string
> = {
    tensao: "avgVoltage",
    corrente: "avgCurrent",
    pativa: "avgPowerW",
    preativa: "avgReactivePowerVar",
    paparente: "avgApparentPowerVa",
    fp: "avgPowerFactor",
    freq: "avgFrequencyHz",
}

/**
 * Expressão SQL do valor de uma grandeza numa linha de `meter_readings`.
 * `thdv`/`thdi` não têm coluna agregada própria (só por fase) — o seletor de
 * série não distingue fase, então o valor é a média das 3, mesmo tratamento
 * já dado ao fator de potência (que também expõe uma "Média" em destaque,
 * apesar de ter colunas por fase). Se qualquer uma das 3 fases for `NULL`
 * numa linha, a média dessa linha também é `NULL` — aritmética com `NULL`
 * propaga, então uma leitura com dado parcial não gera uma média inventada
 * com 2 das 3 fases.
 *
 * @param metric - A grandeza escolhida.
 * @returns O fragmento SQL do valor, pronto para `MIN`/`MAX`/soma ponderada.
 */
function metricValueExpr(metric: MeterReadingSeriesMetric): Prisma.Sql {
    if (metric === "thdv" || metric === "thdi") {
        const prefix = metric === "thdv" ? "avgThdVoltage" : "avgThdCurrent"
        const [a, b, c] = [
            quotedColumn(`${prefix}PhaseA`),
            quotedColumn(`${prefix}PhaseB`),
            quotedColumn(`${prefix}PhaseC`),
        ]
        return Prisma.sql`((${a} + ${b} + ${c}) / 3.0)`
    }
    return quotedColumn(DIRECT_SERIES_METRIC_COLUMNS[metric])
}

/**
 * Expressão SQL do início do balde de uma linha, na convenção "dígitos
 * locais de SP mascarados como UTC" (`localTsExpr()`). `window="dia"` usa
 * `date_trunc` puro (24 baldes fixos de 1h); `window="hora"` precisa de um
 * balde por múltiplo de `aggregationMinutes`, que `date_trunc` sozinho não
 * expressa (só trunca em unidades fixas como minuto/hora) — daí o
 * `floor(minuto / N) * N`, que arredonda o minuto da linha para baixo até o
 * múltiplo de N mais próximo antes de somar de volta à hora truncada.
 *
 * @param window - Janela escolhida (`hora` ou `dia`).
 * @param aggregationMinutes - Tamanho do balde em minutos, só relevante para `window="hora"`.
 * @returns O fragmento SQL do início do balde, usável em `SELECT`/`GROUP BY`.
 */
function seriesBucketExpr(
    window: MeterReadingSeriesWindow,
    aggregationMinutes: MeterReadingSeriesAggregationMinutes | undefined,
): Prisma.Sql {
    const localTs = localTsExpr()
    if (window === "dia") {
        return Prisma.sql`date_trunc('hour', ${localTs})`
    }
    return Prisma.sql`date_trunc('hour', ${localTs})
        + (floor(date_part('minute', ${localTs}) / ${aggregationMinutes}) * ${aggregationMinutes})
            * interval '1 minute'`
}

/**
 * Início de um período de comparação forçado para `timestamp` sem fuso —
 * mesmo tipo da coluna `minuteStart`, que guarda o instante em UTC sem
 * marcação de fuso. Sem este cast explícito, um valor vindo como parâmetro
 * arriscaria ser promovido a `timestamptz` e reinterpretado no fuso da
 * sessão do banco antes da subtração em {@link periodBucketExpr},
 * introduzindo um deslocamento silencioso; forçar `timestamp` aqui elimina
 * essa ambiguidade de tipo.
 *
 * @param periodStart - Início do período, como recebido da API (instante UTC).
 * @returns O fragmento SQL do início do período, já no mesmo tipo de `minuteStart`.
 */
function periodStartExpr(periodStart: Date): Prisma.Sql {
    return Prisma.sql`${periodStart}::timestamp`
}

/**
 * Expressão SQL do início do balde de uma linha, relativo ao início do
 * PRÓPRIO período (não a uma fronteira de calendário — ver
 * `meter-reading-compare-periods.ts` para o porquê). `extract(epoch from
 * ...)` mede a distância em segundos até `periodStart`; `floor(.../
 * bucketSeconds)` arredonda para baixo até o múltiplo do tamanho do balde,
 * somado de volta ao início do período.
 *
 * @param periodStart - Início do período (origem dos baldes relativos).
 * @param bucketSeconds - Tamanho do balde em segundos (3600 para hora, 86400 para dia).
 * @returns O fragmento SQL do início do balde, usável em `SELECT`/`GROUP BY`.
 */
function periodBucketExpr(periodStart: Date, bucketSeconds: number): Prisma.Sql {
    const start = periodStartExpr(periodStart)
    return Prisma.sql`${start}
        + (floor(extract(epoch from ("minuteStart" - ${start})) / ${bucketSeconds}) * ${bucketSeconds})
            * interval '1 second'`
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
        const optionalColumns = Prisma.join(OPTIONAL_AVG_FIELDS.map(quotedColumn))
        const optionalValues = Prisma.join(
            OPTIONAL_AVG_FIELDS.map((field) => Prisma.sql`${snapshot[field]}`),
        )
        const optionalMergeSets = Prisma.join(OPTIONAL_AVG_FIELDS.map(optionalMergeClause))

        await this.prisma.$executeRaw`
            INSERT INTO "meter_readings" (
                "id", "meterId", "minuteStart", "kwhConsumed", "avgVoltage", "avgCurrent",
                "avgPowerW", "avgPowerFactor", "sampleCount", "secondsCovered",
                ${optionalColumns}, "updatedAt"
            )
            VALUES (
                ${randomUUID()}, ${snapshot.meterId}, ${snapshot.minuteStart},
                ${snapshot.energyKwh}, ${snapshot.avgVoltage}, ${snapshot.avgCurrent},
                ${snapshot.avgPowerW}, ${snapshot.avgPowerFactor}, ${snapshot.sampleCount},
                ${snapshot.secondsCovered}, ${optionalValues}, now()
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
                ${optionalMergeSets},
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
     * Série de uma grandeza numa janela, com mínimo/média/máximo por balde —
     * a área de análise configurável, não o gráfico "ao vivo" (isso é
     * `findAggregated`). Média ponderada por `secondsCovered`, mesma receita
     * do resto do módulo; mínimo/máximo são os extremos crus das linhas do
     * balde, sem ponderação (ponderar um extremo não faz sentido). Um balde
     * sem nenhuma linha simplesmente não aparece no resultado — é
     * responsabilidade de quem chama completá-lo com `null`
     * (`fillMissingBuckets`), não desta query.
     *
     * @param meterId - Id do medidor.
     * @param metric - Grandeza escolhida.
     * @param window - Janela (`hora` ou `dia`).
     * @param aggregationMinutes - Tamanho do balde em minutos, só para `window="hora"`.
     * @param from - Início real (UTC) da janela, inclusive.
     * @param to - Fim real (UTC) da janela, exclusivo.
     * @returns Os baldes com dado, em qualquer ordem — cada um com mínimo/média/máximo (`null` se a grandeza nunca foi reportada no balde).
     */
    async findSeries(
        meterId: string,
        metric: MeterReadingSeriesMetric,
        window: MeterReadingSeriesWindow,
        aggregationMinutes: MeterReadingSeriesAggregationMinutes | undefined,
        from: Date,
        to: Date,
    ): Promise<SeriesBucketValues[]> {
        const bucket = seriesBucketExpr(window, aggregationMinutes)
        const value = metricValueExpr(metric)

        const rows = await this.prisma.$queryRaw<
            { bucket: Date; min: number | null; avg: number | null; max: number | null }[]
        >(
            Prisma.sql`
                SELECT
                    ${bucket} AS bucket,
                    -- Uma linha com "secondsCovered" = 0 (a primeira amostra
                    -- do medidor, sem amostra anterior para calcular Δt)
                    -- grava as 4 grandezas obrigatórias como 0 (a coluna não
                    -- é nula) — o FILTER a exclui do mínimo/máximo, senão
                    -- entraria como um "0 V"/"0 Hz" espúrio, inconsistente
                    -- com a média (que já a ignora via NULLIF/soma acima).
                    MIN(${value}) FILTER (WHERE "secondsCovered" > 0) AS min,
                    SUM(${value} * "secondsCovered")
                        / NULLIF(SUM(CASE WHEN ${value} IS NULL THEN NULL ELSE "secondsCovered" END), 0)
                        AS avg,
                    MAX(${value}) FILTER (WHERE "secondsCovered" > 0) AS max
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                ${rangeFilter(from, to)}
                GROUP BY bucket
            `,
        )

        return rows.map((r) => ({
            bucketStart: r.bucket,
            min: r.min === null ? null : Number(r.min),
            avg: r.avg === null ? null : Number(r.avg),
            max: r.max === null ? null : Number(r.max),
        }))
    }

    /**
     * Série de uma grandeza num período arbitrário, com balde relativo ao
     * início do PRÓPRIO período — ver
     * {@link periodBucketExpr} para o porquê de não alinhar por calendário.
     * Mesma receita de mínimo/média/máximo (`FILTER` de peso zero, `NULLIF`)
     * de {@link findSeries}; um balde sem nenhuma linha não aparece no
     * resultado, mesma responsabilidade de completar com `null` de quem
     * chama (`fillMissingBuckets`).
     *
     * @param meterId - Id do medidor.
     * @param metric - Grandeza escolhida.
     * @param bucketSeconds - Tamanho do balde em segundos (3600 ou 86400, conforme a granularidade derivada da duração).
     * @param from - Início do período, inclusive — também a origem dos baldes relativos.
     * @param to - Fim real da janela, exclusivo.
     * @returns Os baldes com dado, em qualquer ordem — cada um com mínimo/média/máximo (`null` se a grandeza nunca foi reportada no balde).
     */
    async findPeriodSeries(
        meterId: string,
        metric: MeterReadingSeriesMetric,
        bucketSeconds: number,
        from: Date,
        to: Date,
    ): Promise<SeriesBucketValues[]> {
        const bucket = periodBucketExpr(from, bucketSeconds)
        const value = metricValueExpr(metric)

        const rows = await this.prisma.$queryRaw<
            { bucket: Date; min: number | null; avg: number | null; max: number | null }[]
        >(
            Prisma.sql`
                SELECT
                    ${bucket} AS bucket,
                    MIN(${value}) FILTER (WHERE "secondsCovered" > 0) AS min,
                    SUM(${value} * "secondsCovered")
                        / NULLIF(SUM(CASE WHEN ${value} IS NULL THEN NULL ELSE "secondsCovered" END), 0)
                        AS avg,
                    MAX(${value}) FILTER (WHERE "secondsCovered" > 0) AS max
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                ${rangeFilter(from, to)}
                GROUP BY bucket
            `,
        )

        return rows.map((r) => ({
            bucketStart: r.bucket,
            min: r.min === null ? null : Number(r.min),
            avg: r.avg === null ? null : Number(r.avg),
            max: r.max === null ? null : Number(r.max),
        }))
    }

    /**
     * Mínimo/média/máximo de uma grandeza no período inteiro, sem baldear —
     * a base do total/média do período e da diferença de B sobre A na
     * comparação de dois períodos. Mesma ponderação e exclusão de peso zero de
     * {@link findSeries}, sem `GROUP BY`: a query sempre devolve uma única
     * linha, mesmo sem nenhuma leitura no período (agregação sem `GROUP BY`
     * nunca devolve zero linhas).
     *
     * @param meterId - Id do medidor.
     * @param metric - Grandeza escolhida.
     * @param from - Início real da janela, inclusive.
     * @param to - Fim real da janela, exclusivo.
     * @returns Mínimo/média/máximo do período (`null` se a grandeza nunca foi reportada).
     */
    async findPeriodSummary(
        meterId: string,
        metric: MeterReadingSeriesMetric,
        from: Date,
        to: Date,
    ): Promise<{ min: number | null; avg: number | null; max: number | null }> {
        const value = metricValueExpr(metric)

        const rows = await this.prisma.$queryRaw<
            { min: number | null; avg: number | null; max: number | null }[]
        >(
            Prisma.sql`
                SELECT
                    MIN(${value}) FILTER (WHERE "secondsCovered" > 0) AS min,
                    SUM(${value} * "secondsCovered")
                        / NULLIF(SUM(CASE WHEN ${value} IS NULL THEN NULL ELSE "secondsCovered" END), 0)
                        AS avg,
                    MAX(${value}) FILTER (WHERE "secondsCovered" > 0) AS max
                FROM "meter_readings"
                WHERE "meterId" = ${meterId}
                ${rangeFilter(from, to)}
            `,
        )

        const row = rows[0]!
        return {
            min: row.min === null ? null : Number(row.min),
            avg: row.avg === null ? null : Number(row.avg),
            max: row.max === null ? null : Number(row.max),
        }
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
     * @param count - Quantas leituras buscar (15 na definição de demanda medida).
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

    /**
     * Leituras por minuto de um intervalo, da mais antiga para a mais recente
     * — o insumo da curva de demanda do dia (no máximo 1440 linhas por dia e
     * medidor).
     *
     * @param meterId - Id do medidor.
     * @param from - Início do intervalo (inclusive), instante UTC real.
     * @param to - Fim do intervalo (exclusivo), instante UTC real.
     * @returns Minuto, potência média e cobertura de cada leitura do intervalo.
     */
    async findMinuteReadings(
        meterId: string,
        from: Date,
        to: Date,
    ): Promise<{ minuteStart: Date; avgPowerW: number; secondsCovered: number }[]> {
        return this.prisma.meterReading.findMany({
            where: { meterId, minuteStart: { gte: from, lt: to } },
            select: { minuteStart: true, avgPowerW: true, secondsCovered: true },
            orderBy: { minuteStart: "asc" },
        })
    }
}
