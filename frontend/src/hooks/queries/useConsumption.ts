import { useQuery } from "@tanstack/react-query"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { Granularity } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"

/**
 * Consumo agregado de um alvo (Fase 5 — substitui `useConsumptionBy*`).
 *
 * `enabled: Boolean(targetId)` evita disparar a query quando o param de rota
 * ainda não chegou. O 404 "alvo sem medidor" propaga como erro normal do
 * TanStack Query — quem consome decide a mensagem (ver ConsumptionSection).
 */
export const useConsumption = (
    targetType: TargetType,
    targetId: string | undefined,
    granularity: Granularity,
    page: number = 1,
    pageSize: number = DEFAULT_PAGE_SIZE,
) =>
    useQuery({
        queryKey: queryKeys.consumption.list(
            targetType,
            targetId ?? "",
            granularity,
            page,
            pageSize,
        ),
        queryFn: () =>
            consumptionService.list({
                targetType,
                targetId: targetId!,
                granularity,
                page,
                pageSize,
            }),
        enabled: Boolean(targetId),
    })
