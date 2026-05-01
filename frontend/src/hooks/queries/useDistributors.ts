import { useQuery } from "@tanstack/react-query"
import { distributorService } from "@/services/distributor.service"
import { queryKeys } from "@/lib/queryClient"
import type { Distributor } from "@/types/distributor.types"

/**
 * Lista todas as distribuidoras do usuário autenticado.
 *
 * Retorna o `result` completo do useQuery — quem consome decide se quer
 * `data`, `isLoading`, `isError`, etc. Mais flexível do que retornar só
 * o array (desperdiçaria os estados de loading/error).
 */
export const useDistributors = () =>
    useQuery({
        queryKey: queryKeys.distributors.list(),
        queryFn: () => distributorService.list(),
    })

/**
 * Detalhes de uma distribuidora.
 *
 * `enabled: !!id` evita disparar a query quando id é undefined/empty
 * (útil em rotas dinâmicas onde o param ainda não chegou).
 */
export const useDistributor = (id: string | undefined) =>
    useQuery<Distributor>({
        queryKey: queryKeys.distributors.detail(id ?? ""),
        queryFn: () => distributorService.getById(id!),
        enabled: Boolean(id),
    })