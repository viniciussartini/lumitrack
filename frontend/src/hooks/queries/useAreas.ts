import { useQuery } from "@tanstack/react-query"
import { areaService } from "@/services/area.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { Area } from "@/types/area.types"

/**
 * Lista as áreas de uma propriedade (paginado).
 *
 * `enabled: Boolean(propertyId)` evita disparar a query quando propertyId é
 * undefined/empty (rotas dinâmicas onde o param ainda não chegou).
 */
export const useAreas = (
    propertyId: string | undefined,
    page: number = 1,
    pageSize: number = DEFAULT_PAGE_SIZE,
) =>
    useQuery({
        queryKey: queryKeys.areas.list(propertyId ?? "", page, pageSize),
        queryFn: () => areaService.list(propertyId!, { page, pageSize }),
        enabled: Boolean(propertyId),
    })

/**
 * Detalhes de uma área específica dentro de uma propriedade.
 *
 * Ambos os params são obrigatórios pra disparar (nesse padrão de rotas
 * aninhadas, sem propertyId não tem como bater no endpoint correto).
 */
export const useArea = (propertyId: string | undefined, areaId: string | undefined) =>
    useQuery<Area>({
        queryKey: queryKeys.areas.detail(propertyId ?? "", areaId ?? ""),
        queryFn: () => areaService.getById(propertyId!, areaId!),
        enabled: Boolean(propertyId && areaId),
    })
