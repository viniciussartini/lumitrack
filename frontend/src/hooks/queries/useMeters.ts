import { useQuery } from "@tanstack/react-query"
import { meterService } from "@/services/meter.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { TargetType } from "@/types/meter.types"

/**
 * Lista os medidores do usuário autenticado (paginado).
 * Usada pelo seletor de medidor no form de criação de alerta.
 */
export const useMeters = (page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) =>
    useQuery({
        queryKey: queryKeys.meters.list(page, pageSize),
        queryFn: () => meterService.list({ page, pageSize }),
    })

/**
 * Medidor vinculado a um alvo específico (propriedade/área/dispositivo).
 * Retorna `null` (não erro) quando o alvo não tem medidor — é o estado
 * padrão de um alvo recém-criado, não uma falha.
 */
export const useMeterByTarget = (targetType: TargetType, targetId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.meters.byTarget(targetType, targetId ?? ""),
        queryFn: () => meterService.byTarget(targetType, targetId!),
        enabled: Boolean(targetId),
    })

export const useMeter = (id: string | undefined) =>
    useQuery({
        queryKey: queryKeys.meters.detail(id ?? ""),
        queryFn: () => meterService.getById(id!),
        enabled: Boolean(id),
    })
