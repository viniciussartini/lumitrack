import { useQuery } from "@tanstack/react-query"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"
import type {
    ConsumptionRecord,
    ConsumptionPeriod,
} from "@/types/consumption.types"

/**
 * Hooks de query para registros de consumo.
 *
 * Há 3 hooks `useConsumptionBy*` (um por target) em vez de um único genérico
 * porque cada target tem combinação distinta de IDs obrigatórios:
 *   - byProperty: propertyId
 *   - byArea:     propertyId + areaId
 *   - byDevice:   propertyId + areaId + deviceId
 *
 * Unificar num só forçaria types tipo `ConsumptionTarget` no consumidor —
 * que sempre sabe estaticamente em qual contexto está. Três funções dão
 * type safety natural sem ginástica de discriminated unions.
 *
 * Filtro `period` opcional:
 *   - undefined → backend retorna todos os períodos
 *   - "DAILY" / "HOURLY" / etc → filtra no backend via query param
 *
 * A queryKey inclui o period — trocar o filtro dispara nova query (cache
 * separado por (target, period)). É barato porque o volume de registros
 * por (target, period) é naturalmente pequeno.
 */

export const useConsumptionByProperty = (
    propertyId: string | undefined,
    period?: ConsumptionPeriod,
) =>
    useQuery<ConsumptionRecord[]>({
        queryKey: queryKeys.consumption.byProperty(propertyId ?? "", period),
        queryFn: () =>
            consumptionService.listByProperty(propertyId!, period),
        enabled: Boolean(propertyId),
    })

export const useConsumptionByArea = (
    propertyId: string | undefined,
    areaId: string | undefined,
    period?: ConsumptionPeriod,
) =>
    useQuery<ConsumptionRecord[]>({
        queryKey: queryKeys.consumption.byArea(
            propertyId ?? "",
            areaId ?? "",
            period,
        ),
        queryFn: () =>
            consumptionService.listByArea(propertyId!, areaId!, period),
        enabled: Boolean(propertyId && areaId),
    })

export const useConsumptionByDevice = (
    propertyId: string | undefined,
    areaId: string | undefined,
    deviceId: string | undefined,
    period?: ConsumptionPeriod,
) =>
    useQuery<ConsumptionRecord[]>({
        queryKey: queryKeys.consumption.byDevice(
            propertyId ?? "",
            areaId ?? "",
            deviceId ?? "",
            period,
        ),
        queryFn: () =>
            consumptionService.listByDevice(
                propertyId!,
                areaId!,
                deviceId!,
                period,
            ),
        enabled: Boolean(propertyId && areaId && deviceId),
    })

/**
 * Detalhe de um registro de consumo.
 *
 * `propertyId` é obrigatório porque o backend usa essa rota pra autorizar
 * (validação de posse: property → user). Sem ele, dá 401/403.
 */
export const useConsumption = (
    propertyId: string | undefined,
    id: string | undefined,
) =>
    useQuery<ConsumptionRecord>({
        queryKey: queryKeys.consumption.detail(id ?? ""),
        queryFn: () => consumptionService.getById(propertyId!, id!),
        enabled: Boolean(propertyId && id),
    })