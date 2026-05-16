import type {
    DashboardData,
    DashboardPropertyEntry,
    DashboardSummary,
    DashboardTimeSeriesPoint,
    DashboardTrendBreakdown,
} from "@/types/dashboard.types"
import type { ReportPeriod } from "@/types/report.types"

/**
 * Funções puras de agregação cross-propriedades.
 *
 * Extraídas em módulo separado porque:
 *   1. Lógica de agregação é pura (recebe entries, retorna data) — vale
 *      muito mais a pena testar isolado do que via hook + RTL.
 *   2. Funções nomeadas explicitam intenção: `aggregateTimeSeries` é
 *      auto-documentado; um useMemo inline com loop e Map seria opaco.
 *   3. Reuso futuro: se um dia houver "Dashboard por área" ou um widget
 *      embeddable, a lógica vem inteira de cá.
 *
 * Convenção: funções recebem `entries` (já enriquecidas com propertyName)
 * em vez de results brutos do useQueries. Quem orquestra o mapeamento
 * é o hook — agregadores trabalham num formato consistente.
 */

/**
 * Agrega o summary global a partir de todas as entries.
 *
 * Entries com status="error" são pulados nos somatórios (não há result),
 * mas contam em `propertyCount` (o usuário tem aquela propriedade).
 *
 * `propertyWithDataCount` filtra ainda mais: só conta propriedades cujo
 * relatório tem PELO MENOS 1 record no período. Uma propriedade sem
 * lançamentos não é "sem dado" — é "sem dado no range escolhido".
 */
export const aggregateSummary = (
    entries: DashboardPropertyEntry[],
): DashboardSummary => {
    let totalKwh = 0
    let totalCostBrl = 0
    let recordCount = 0
    let propertyWithDataCount = 0

    for (const entry of entries) {
        if (entry.status !== "success" || !entry.result) continue

        totalKwh += entry.result.summary.totalKwh
        totalCostBrl += entry.result.summary.totalCostBrl
        recordCount += entry.result.summary.recordCount

        if (entry.result.summary.recordCount > 0) {
            propertyWithDataCount += 1
        }
    }

    return {
        totalKwh,
        totalCostBrl,
        recordCount,
        propertyCount: entries.length,
        propertyWithDataCount,
        trendBreakdown: aggregateTrendBreakdown(entries),
    }
}

/**
 * Conta entries por trend.
 *
 * Importante: só propriedades com status="success" entram. Erro não vira
 * "INSUFFICIENT_DATA" — é um buraco distinto de "tem propriedade mas sem
 * dados", e seria enganoso classificá-lo como tal.
 *
 * Consequência: a soma das 4 contagens pode ser MENOR que propertyCount
 * quando houver erros. A UI mostra esse delta como aviso de erro parcial.
 */
export const aggregateTrendBreakdown = (
    entries: DashboardPropertyEntry[],
): DashboardTrendBreakdown => {
    const breakdown: DashboardTrendBreakdown = {
        increasing: 0,
        decreasing: 0,
        stable: 0,
        insufficient: 0,
    }

    for (const entry of entries) {
        if (entry.status !== "success" || !entry.result) continue

        switch (entry.result.summary.trend) {
            case "INCREASING":
                breakdown.increasing += 1
                break
            case "DECREASING":
                breakdown.decreasing += 1
                break
            case "STABLE":
                breakdown.stable += 1
                break
            case "INSUFFICIENT_DATA":
                breakdown.insufficient += 1
                break
        }
    }

    return breakdown
}

/**
 * Agrupa records por referenceDate, somando kWh e custo de TODAS as
 * propriedades naquela data.
 *
 * Pré-condição: todos os records têm o MESMO period (= o filtro ativo),
 * porque o backend alinha record.period ao query.period. Assim, records
 * de propriedades distintas com o mesmo referenceDate são comparáveis
 * (mesma fatia temporal) e podem ser somados.
 *
 * Ordenação ASC por referenceDate — o BarChart espera o eixo X cronológico
 * da esquerda pra direita.
 *
 * `period` no output: vem do primeiro record encontrado por chave. Como
 * todos compartilham o mesmo period, não há ambiguidade.
 */
export const aggregateTimeSeries = (
    entries: DashboardPropertyEntry[],
): DashboardTimeSeriesPoint[] => {
    const map = new Map<string, DashboardTimeSeriesPoint>()

    for (const entry of entries) {
        if (entry.status !== "success" || !entry.result) continue

        for (const record of entry.result.records) {
            const key = record.referenceDate
            const existing = map.get(key)

            if (existing) {
                existing.totalKwh += record.kwhConsumed
                existing.totalCostBrl += record.costBrl ?? 0
                existing.propertyCount += 1
            } else {
                map.set(key, {
                    referenceDate: record.referenceDate,
                    period: record.period as ReportPeriod,
                    totalKwh: record.kwhConsumed,
                    totalCostBrl: record.costBrl ?? 0,
                    propertyCount: 1,
                })
            }
        }
    }

    return [...map.values()].sort((a, b) =>
        a.referenceDate.localeCompare(b.referenceDate),
    )
}

/**
 * Ordena entries para a tabela/ranking.
 *
 * Critério primário: totalKwh DESC (quem consome mais aparece primeiro).
 * Entries com status="error" vão pro FINAL (sem totalKwh confiável), e
 * entre eles ordenamos por propertyName ASC pra estabilidade visual.
 *
 * Não muta o array de entrada — retorna cópia ordenada.
 */
export const rankPropertiesByKwh = (
    entries: DashboardPropertyEntry[],
): DashboardPropertyEntry[] => {
    return [...entries].sort((a, b) => {
        // Erros vão pro fim
        if (a.status === "error" && b.status !== "error") return 1
        if (b.status === "error" && a.status !== "error") return -1

        // Ambos erro → alfabético
        if (a.status === "error" && b.status === "error") {
            return a.propertyName.localeCompare(b.propertyName)
        }

        // Ambos sucesso → kWh desc
        const aKwh = a.result?.summary.totalKwh ?? 0
        const bKwh = b.result?.summary.totalKwh ?? 0
        return bKwh - aKwh
    })
}

/**
 * Combina tudo: recebe entries brutas, devolve DashboardData completo.
 *
 * Esse é o ponto de entrada que o useDashboard consome via useMemo.
 * Manter como função separada (em vez de inline no hook) permite testar
 * end-to-end a agregação com input fixo, sem mockar useQueries.
 */
export const buildDashboardData = (
    entries: DashboardPropertyEntry[],
): DashboardData => ({
    summary: aggregateSummary(entries),
    perProperty: rankPropertiesByKwh(entries),
    timeSeries: aggregateTimeSeries(entries),
})