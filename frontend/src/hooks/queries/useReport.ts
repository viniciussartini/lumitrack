import { useQuery } from "@tanstack/react-query"
import { reportService } from "@/services/report.service"
import { queryKeys } from "@/lib/queryClient"
import type { ReportPeriod, ReportResult } from "@/types/report.types"

/**
 * Hooks de query para Relatórios.
 *
 * Espelha a estrutura de useConsumption: 3 hooks `useReportBy*`, um por
 * target. Mesma justificativa de design: cada target tem uma combinação
 * distinta de IDs obrigatórios, e separar dá type-safety natural.
 *
 * Sobre o filtro `period` ser obrigatório (diferente de consumption):
 *   Em /report, o backend EXIGE period — não há "todos os períodos"
 *   numa visão agregada. Default vem da página.
 *
 * Sobre staleTime / refetch:
 *   Usa default global (30s + refetchOnWindowFocus=true). Relatório é
 *   read-only e re-render é barato — não vale pena customizar.
 *
 * Sobre invalidação:
 *   Não há mutations em relatório. O que invalida o cache são MUTATIONS
 *   DE CONSUMPTION (criar/editar/excluir registro muda o relatório).
 *   Essa invalidação cruzada NÃO está implementada e é deliberado:
 *     a) o usuário típico não fica criando consumo no meio de um relatório,
 *     b) refetch ao voltar pra aba (focus) cobre o caso real,
 *     c) implementar exigiria mexer em useConsumptionMutations só pra
 *        invalidar um cache opcional — alto acoplamento por pouco ganho.
 *   Pode ser adicionado depois se o uso real mostrar necessidade.
 */

interface ReportArgs {
    period: ReportPeriod
    dateFrom?: string
    dateTo?: string
}

export const useReportByProperty = (
    propertyId: string | undefined,
    args: ReportArgs,
) =>
    useQuery<ReportResult>({
        queryKey: queryKeys.reports.byProperty(
            propertyId ?? "",
            args.period,
            args.dateFrom,
            args.dateTo,
        ),
        queryFn: () =>
            reportService.generateByProperty(propertyId!, args),
        enabled: Boolean(propertyId),
    })

export const useReportByArea = (
    propertyId: string | undefined,
    areaId: string | undefined,
    args: ReportArgs,
) =>
    useQuery<ReportResult>({
        queryKey: queryKeys.reports.byArea(
            propertyId ?? "",
            areaId ?? "",
            args.period,
            args.dateFrom,
            args.dateTo,
        ),
        queryFn: () =>
            reportService.generateByArea(propertyId!, areaId!, args),
        enabled: Boolean(propertyId && areaId),
    })

export const useReportByDevice = (
    propertyId: string | undefined,
    areaId: string | undefined,
    deviceId: string | undefined,
    args: ReportArgs,
) =>
    useQuery<ReportResult>({
        queryKey: queryKeys.reports.byDevice(
            propertyId ?? "",
            areaId ?? "",
            deviceId ?? "",
            args.period,
            args.dateFrom,
            args.dateTo,
        ),
        queryFn: () =>
            reportService.generateByDevice(
                propertyId!,
                areaId!,
                deviceId!,
                args,
            ),
        enabled: Boolean(propertyId && areaId && deviceId),
    })