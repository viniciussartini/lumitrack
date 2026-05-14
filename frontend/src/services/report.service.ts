import { api } from "@/services/api"
import type { ReportPeriod, ReportResult } from "@/types/report.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Constrói query string `?target=...&period=...&dateFrom=...&dateTo=...`
 *
 * O backend exige `target` e `period` sempre. Quando o target é AREA ou
 * DEVICE, também exige `targetId` (areaId em AREA, deviceId em DEVICE),
 * e em DEVICE ainda exige `targetAreaId`.
 *
 * Encapsulado em uma única função em vez de URLSearchParams porque:
 *   a) os valores são strings ASCII puras (sem chars especiais),
 *   b) deixa a query string final visível no source — facilita debug,
 *   c) é o mesmo padrão do consumption.service (buildListQuery).
 */
const buildQuery = (params: Record<string, string | undefined>): string => {
    const entries = Object.entries(params).filter(
        ([, value]) => value !== undefined && value !== "",
    )
    if (entries.length === 0) return ""
    return "?" + entries.map(([k, v]) => `${k}=${v}`).join("&")
}

interface BaseGenerateArgs {
    period: ReportPeriod
    dateFrom?: string
    dateTo?: string
}

/**
 * Camada de acesso à API de Relatórios.
 *
 * URL única no backend, polimorfismo via query param `target`:
 *   GET /api/properties/:propertyId/report?target=PROPERTY&period=MONTHLY
 *   GET /api/properties/:propertyId/report?target=AREA&targetId=:areaId&period=...
 *   GET /api/properties/:propertyId/report?target=DEVICE&targetId=:deviceId
 *       &targetAreaId=:areaId&period=...
 *
 * 3 métodos `generateBy*` em vez de 1 genérico — mesma decisão
 * de design dos demais services polimórficos do projeto (consumption,
 * alert). Cada consumer sabe estaticamente em qual target está, e o type
 * safety vem de graça sem discriminated unions.
 *
 * Só HTTP, sem cache. O envelope { status, data } é desmembrado aqui.
 */
export const reportService = {
    generateByProperty: async (
        propertyId: string,
        args: BaseGenerateArgs,
    ): Promise<ReportResult> => {
        const query = buildQuery({
            target: "PROPERTY",
            period: args.period,
            dateFrom: args.dateFrom,
            dateTo: args.dateTo,
        })
        const { data } = await api.get<ApiEnvelope<ReportResult>>(
            `/properties/${propertyId}/report${query}`,
        )
        return data.data
    },

    generateByArea: async (
        propertyId: string,
        areaId: string,
        args: BaseGenerateArgs,
    ): Promise<ReportResult> => {
        const query = buildQuery({
            target: "AREA",
            targetId: areaId,
            period: args.period,
            dateFrom: args.dateFrom,
            dateTo: args.dateTo,
        })
        const { data } = await api.get<ApiEnvelope<ReportResult>>(
            `/properties/${propertyId}/report${query}`,
        )
        return data.data
    },

    generateByDevice: async (
        propertyId: string,
        areaId: string,
        deviceId: string,
        args: BaseGenerateArgs,
    ): Promise<ReportResult> => {
        const query = buildQuery({
            target: "DEVICE",
            targetId: deviceId,
            targetAreaId: areaId,
            period: args.period,
            dateFrom: args.dateFrom,
            dateTo: args.dateTo,
        })
        const { data } = await api.get<ApiEnvelope<ReportResult>>(
            `/properties/${propertyId}/report${query}`,
        )
        return data.data
    },
}