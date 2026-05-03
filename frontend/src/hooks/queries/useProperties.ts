import { useQuery } from "@tanstack/react-query"
import { propertyService } from "@/services/property.service"
import { queryKeys } from "@/lib/queryClient"
import type { Property } from "@/types/property.types"

/**
 * Lista todas as propriedades do usuário autenticado.
 *
 * Retorna o `result` completo do useQuery — quem consome decide se quer
 * `data`, `isLoading`, `isError`, etc. Mais flexível do que retornar só
 * o array (desperdiçaria os estados de loading/error).
 */
export const useProperties = () =>
    useQuery({
        queryKey: queryKeys.properties.list(),
        queryFn: () => propertyService.list(),
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