import { useMemo } from "react"
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query"
import { reportService } from "@/services/report.service"
import { propertyService } from "@/services/property.service"
import { queryKeys } from "@/lib/queryClient"
import { extractErrorMessage } from "@/services/api"
import { buildDashboardData } from "@/lib/dashboard/aggregate"
import type { DashboardData, DashboardPropertyEntry } from "@/types/dashboard.types"
import type { Property } from "@/types/property.types"
import type { ReportFilters, ReportResult } from "@/types/report.types"

/**
 * Hook orquestrador do Dashboard.
 *
 * Estratégia: compõe N chamadas paralelas a `reportService.generateByProperty`,
 * uma por propriedade do usuário, e agrega client-side. Não há endpoint
 * agregado no backend.
 *
 * Pipeline:
 *   1. `useProperties()` → lista de propriedades do user (1 chamada).
 *   2. `useQueries(...)` → 1 chamada paralela por propriedade.
 *   3. `buildDashboardData(entries)` em useMemo → agregação pura.
 *
 * Cache compartilhado com /relatorio:
 *   As queries usam `queryKeys.reports.byProperty(id, period, ...)` —
 *   EXATAMENTE a mesma key do hook `useReportByProperty`. Resultado:
 *   abrir o relatório individual de uma propriedade após o Dashboard
 *   carregar é hit de cache instantâneo, e vice-versa.
 *
 * Estados expostos:
 *   - `isLoadingProperties`: a query mãe ainda buscando a lista de props
 *   - `isLoadingReports`: alguma das N report queries pendente
 *   - `isErrorProperties`: falha fatal — sem lista de propriedades, sem
 *     o que mostrar
 *   - `isPartial`: ALGUMAS report queries falharam (mas ao menos uma
 *     teve sucesso ou o user tem só 1 propriedade que falhou). A UI
 *     mostra um aviso e segue exibindo as que vieram.
 *   - `errorCount`: quantas report queries falharam — pro texto do aviso.
 *
 * Convenção de `enabled`:
 *   Cada report query tem `enabled: Boolean(propertyId)`. Como o array
 *   de queries só é construído depois de `properties` chegar, todas as
 *   keys são válidas — o enabled aqui é redundância defensiva.
 *
 * NÃO retorna ConsumptionRecord granular pra fora — quem precisa de
 * detalhe individual abre `/propriedades/:id/relatorio`. O dashboard
 * é uma visão agregada por design.
 */

interface UseDashboardArgs {
    filters: ReportFilters
}

interface UseDashboardResult {
    propertiesQuery: UseQueryResult<Property[]>
    dashboardData: DashboardData | null
    isLoadingProperties: boolean
    isLoadingReports: boolean
    isErrorProperties: boolean
    isPartial: boolean
    errorCount: number
}

export const useDashboard = ({
    filters,
}: UseDashboardArgs): UseDashboardResult => {
    // 1) Query mãe — lista de propriedades do usuário autenticado.
    //    Reaproveitada do padrão de useProperties() (sem invocar o hook
    //    pra manter este módulo auto-contido e facilmente mockável).
    const propertiesQuery = useQuery({
        queryKey: queryKeys.properties.list(),
        queryFn: () => propertyService.list(),
    })

    const properties: Property[] = propertiesQuery.data ?? []

    // 2) N queries paralelas, uma por propriedade.
    //    useQueries lida nativamente com array de tamanho dinâmico —
    //    quando properties chega de [] para [...], as N queries entram
    //    em fetch automaticamente.
    const reportResults = useQueries({
        queries: properties.map((property) => ({
            queryKey: queryKeys.reports.byProperty(
                property.id,
                filters.period,
                filters.dateFrom,
                filters.dateTo,
            ),
            queryFn: (): Promise<ReportResult> =>
                reportService.generateByProperty(property.id, {
                    period: filters.period,
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                }),
            enabled: Boolean(property.id),
        })),
    })

    // 3) Entries enriquecidos com nome da propriedade.
    //    Memoizado por (properties, reportResults) — useQueries retorna
    //    array novo a cada render, mas o conteúdo é estável quando nada
    //    mudou. O useMemo encapsula a lógica de mapeamento e o agregador
    //    em uma única passada.
    const dashboardData = useMemo<DashboardData | null>(() => {
        // Se a lista de propriedades ainda não chegou, não há o que
        // agregar — retornar null sinaliza "ainda carregando estrutura".
        if (!propertiesQuery.isSuccess) return null

        // Aceita o caso "user sem propriedades": entries vazio, summary
        // todo zero. A página decide como renderizar (empty state).
        const entries: DashboardPropertyEntry[] = properties.map(
            (property, index) => {
                const result = reportResults[index]

                if (!result) {
                    // Defensivo — em teoria nunca acontece pois
                    // properties e reportResults vêm pareados.
                    const entry: DashboardPropertyEntry = {
                        propertyId: property.id,
                        propertyName: property.name,
                        status: "error",
                        result: null,
                        error: "Erro interno do dashboard",
                    }
                    return entry
                }

                if (result.isError) {
                    const entry: DashboardPropertyEntry = {
                        propertyId: property.id,
                        propertyName: property.name,
                        status: "error",
                        result: null,
                        error: extractErrorMessage(result.error),
                    }
                    return entry
                }

                if (result.isSuccess && result.data) {
                    const entry: DashboardPropertyEntry = {
                        propertyId: property.id,
                        propertyName: property.name,
                        status: "success",
                        result: result.data,
                        error: null,
                    }
                    return entry
                }

                // Ainda carregando — entries só fazem sentido após TODAS
                // resolverem; se cair aqui, dashboardData ainda é null
                // (vide guarda abaixo).
                return null
            },
        ).filter((e): e is NonNullable<typeof e> => e !== null) as DashboardPropertyEntry[]

        // Enquanto ALGUMA report query ainda está carregando, ainda não
        // temos a foto completa — retornar null pra UI mostrar skeleton.
        const stillLoading = reportResults.some((r) => r.isPending)
        if (stillLoading) return null

        return buildDashboardData(entries)
    }, [
        properties,
        reportResults,
        propertiesQuery.isSuccess,
    ])

    const isLoadingReports = reportResults.some((r) => r.isPending)
    const errorCount = reportResults.filter((r) => r.isError).length

    // Erro "parcial" só faz sentido quando houve PELO MENOS um sucesso
    // e PELO MENOS um erro. Se TODAS falharam, é erro total (mas ainda
    // exibido como aviso, não como tela vazia — o user vê "0 de N" e
    // entende que pode tentar de novo).
    const isPartial = errorCount > 0 && errorCount < reportResults.length

    return {
        propertiesQuery,
        dashboardData,
        isLoadingProperties: propertiesQuery.isPending,
        isLoadingReports,
        isErrorProperties: propertiesQuery.isError,
        isPartial,
        errorCount,
    }
}