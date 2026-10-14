import { useQuery } from "@tanstack/react-query"
import { distributorService } from "@/services/distributor.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { Distributor } from "@/types/distributor.types"

/** O catálogo de distribuidoras muda por seed/administração, não durante a sessão. */
const CATALOG_STALE_TIME = 60 * 60 * 1000

/**
 * Lista o catálogo de distribuidoras (paginado, somente leitura).
 */
export const useDistributors = (page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) =>
    useQuery({
        queryKey: queryKeys.distributors.list(page, pageSize),
        queryFn: () => distributorService.list({ page, pageSize }),
        staleTime: CATALOG_STALE_TIME,
    })

/**
 * Detalhes de uma distribuidora do catálogo.
 *
 * `enabled: !!id` evita disparar a query quando id é undefined/empty
 * (útil em rotas dinâmicas onde o param ainda não chegou).
 */
export const useDistributor = (id: string | undefined) =>
    useQuery<Distributor>({
        queryKey: queryKeys.distributors.detail(id ?? ""),
        queryFn: () => distributorService.getById(id!),
        staleTime: CATALOG_STALE_TIME,
        enabled: Boolean(id),
    })
