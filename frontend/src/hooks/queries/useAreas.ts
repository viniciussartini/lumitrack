import { useQuery } from "@tanstack/react-query"
import { areaService } from "@/services/area.service"
import { queryKeys } from "@/lib/queryClient"
import type { Area } from "@/types/area.types"

/**
 * Lista todas as áreas de uma propriedade.
 *
 * `enabled: Boolean(propertyId)` evita disparar a query quando propertyId é
 * undefined/empty (rotas dinâmicas onde o param ainda não chegou). Sem isso,
 * o queryFn rodaria com `undefined` na URL e geraria uma 404 desnecessária.
 *
 * Retorna o `result` completo do useQuery — quem consome decide se quer
 * `data`, `isLoading`, `isError`, etc.
 */
export const useAreas = (propertyId: string | undefined) =>
    useQuery<Area[]>({
        queryKey: queryKeys.areas.list(propertyId ?? ""),
        queryFn: () => areaService.list(propertyId!),
        enabled: Boolean(propertyId),
    })

/**
 * Detalhes de uma área específica dentro de uma propriedade.
 *
 * Ambos os params são obrigatórios pra disparar (nesse padrão de rotas
 * aninhadas, sem propertyId não tem como bater no endpoint correto).
 */
export const useArea = (
    propertyId: string | undefined,
    areaId: string | undefined,
) =>
    useQuery<Area>({
        queryKey: queryKeys.areas.detail(propertyId ?? "", areaId ?? ""),
        queryFn: () => areaService.getById(propertyId!, areaId!),
        enabled: Boolean(propertyId && areaId),
    })