import { useQueries } from "@tanstack/react-query"
import { areaService } from "@/services/area.service"
import { queryKeys } from "@/lib/queryClient"
import { MAX_PAGE_SIZE } from "@/types/pagination.types"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"

export interface PropertyAreas {
    property: Property
    areas: Area[]
}

/**
 * Áreas de várias propriedades de uma vez, agrupadas por propriedade — para
 * seletores que precisam de todas as opções (uma consulta por propriedade,
 * com a mesma chave de `useAreas`, então o cache é compartilhado).
 *
 * `enabled` deixa o chamador adiar a busca (ex.: só com o modal aberto).
 * Cada propriedade traz no máximo `MAX_PAGE_SIZE` áreas — o teto do backend.
 *
 * `isLoading` cobre também o intervalo em que a busca está desabilitada: sem
 * dados ainda não é "vazio", é "não sabemos".
 */
export const useAreasByProperties = (properties: readonly Property[], enabled: boolean) =>
    useQueries({
        queries: properties.map((property) => ({
            queryKey: queryKeys.areas.list(property.id, 1, MAX_PAGE_SIZE),
            queryFn: () => areaService.list(property.id, { page: 1, pageSize: MAX_PAGE_SIZE }),
            enabled,
        })),
        combine: (results) => ({
            isLoading: results.some((result) => result.isPending),
            isError: results.some((result) => result.isError),
            groups: results.map((result, index): PropertyAreas => ({
                property: properties[index]!,
                areas: result.data?.items ?? [],
            })),
        }),
    })
