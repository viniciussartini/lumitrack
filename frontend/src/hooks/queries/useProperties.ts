import { useQuery } from "@tanstack/react-query"
import { propertyService } from "@/services/property.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { Property } from "@/types/property.types"

/**
 * Lista as propriedades do usuário autenticado (paginado).
 */
export const useProperties = (page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) =>
    useQuery({
        queryKey: queryKeys.properties.list(page, pageSize),
        queryFn: () => propertyService.list({ page, pageSize }),
    })

/**
 * Detalhes de uma propriedade.
 *
 * `enabled: !!id` evita disparar a query quando id é undefined/empty
 * (útil em rotas dinâmicas onde o param ainda não chegou).
 */
export const useProperty = (id: string | undefined) =>
    useQuery<Property>({
        queryKey: queryKeys.properties.detail(id ?? ""),
        queryFn: () => propertyService.getById(id!),
        enabled: Boolean(id),
    })
