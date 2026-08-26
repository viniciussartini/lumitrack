import { useQuery } from "@tanstack/react-query"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"
import { DEFAULT_PAGE_SIZE } from "@/types/pagination.types"
import type { BucketOrder, BucketSize } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"

/** Janela consultada — vem de `resolveConsumptionWindow` (lib/consumptionWindow). */
export interface ConsumptionRange {
    from: Date
    to: Date
    /** Default do backend: `desc`. Listagens de janela pedem `asc`. */
    order?: BucketOrder
}

/**
 * Consumo agregado de um alvo (Fase 5 — substitui `useConsumptionBy*`).
 *
 * `bucketSize` é o tamanho do bucket, não a granularidade escolhida na UI:
 * quem traduz uma na outra é `resolveConsumptionWindow`, e o resultado dessa
 * tradução entra aqui como `range`. Sem `range`, a chamada é "os últimos N
 * buckets" (KPIs e comparação do painel), com a ordem `desc` do backend.
 *
 * `enabled: Boolean(targetId)` evita disparar a query quando o param de rota
 * ainda não chegou. O 404 "alvo sem medidor" propaga como erro normal do
 * TanStack Query — quem consome decide a mensagem (ver ConsumptionSection).
 */
export const useConsumption = (
    targetType: TargetType,
    targetId: string | undefined,
    bucketSize: BucketSize,
    page: number = 1,
    pageSize: number = DEFAULT_PAGE_SIZE,
    range?: ConsumptionRange,
) =>
    useQuery({
        queryKey: queryKeys.consumption.list(
            targetType,
            targetId ?? "",
            bucketSize,
            page,
            pageSize,
            range &&
                `${range.from.toISOString()}|${range.to.toISOString()}|${range.order ?? "desc"}`,
        ),
        queryFn: () =>
            consumptionService.list({
                targetType,
                targetId: targetId!,
                granularity: bucketSize,
                page,
                pageSize,
                ...range,
            }),
        enabled: Boolean(targetId),
    })

/**
 * Endpoint batch — o último bucket de N alvos do mesmo `targetType`,
 * substituindo o padrão `useQueries` (1 chamada por alvo) que
 * `PropertyComparisonSection`, `AreasSection` e `DevicesSection` usavam.
 *
 * `enabled: ids.length > 0` evita disparar a query com lote vazio (a lista
 * de propriedades/áreas/dispositivos ainda pode não ter carregado).
 */
export const useConsumptionSummary = (
    targetType: TargetType,
    ids: string[],
    granularity: BucketSize,
) =>
    useQuery({
        queryKey: queryKeys.consumption.summary(targetType, ids, granularity),
        queryFn: () => consumptionService.summary({ targetType, ids, granularity }),
        enabled: ids.length > 0,
    })
