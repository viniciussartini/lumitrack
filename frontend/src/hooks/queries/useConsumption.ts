import { useQuery } from "@tanstack/react-query"
import { consumptionService } from "@/services/consumption.service"
import { queryKeys } from "@/lib/queryClient"
import type { BucketOrder, BucketSize } from "@/types/consumption.types"
import { resolveLatestWindow, type LatestRange } from "@/lib/consumptionWindow"
import type { TargetType } from "@/types/meter.types"

/** Janela consultada — vem de `resolveConsumptionWindow` (lib/consumptionWindow). */
export interface ConsumptionRange {
    from: Date
    to: Date
    /** Default do backend: `desc`. Listagens de janela pedem `asc`. */
    order?: BucketOrder
}

/**
 * Janela fixa (as datas entram na chave: outra janela é outra consulta) ou
 * "últimos N baldes" por `latestRange` (a chave leva o tamanho da janela, não
 * as datas, que só são calculadas no pedido: a virada de hora ou de dia refaz
 * o pedido da mesma consulta, sem esvaziar a tela).
 */
export type ConsumptionRangeInput = ConsumptionRange | LatestRange

/**
 * Consumo agregado de um alvo.
 *
 * `bucketSize` é o tamanho do bucket, não a granularidade escolhida na UI:
 * quem traduz uma na outra é `resolveConsumptionWindow`, e o resultado dessa
 * tradução entra aqui como `range`. Toda chamada manda janela: sem ela o
 * backend agregaria o histórico inteiro do medidor para devolver só os últimos
 * buckets. "Os últimos N buckets" (KPIs e comparação do painel) são
 * `latestRange(bucketSize, N)` com a ordem `desc` do backend —
 * chaveados em `queryKeys.consumption.latest`, não `list`, mesmo que
 * targetType/granularity/pageSize coincidam com uma consulta de janela.
 *
 * `enabled: Boolean(targetId)` evita disparar a query quando o param de rota
 * ainda não chegou. O 404 "alvo sem medidor" propaga como erro normal do
 * TanStack Query — quem consome decide a mensagem (ver ConsumptionSection).
 */
export const useConsumption = (
    targetType: TargetType,
    targetId: string | undefined,
    bucketSize: BucketSize,
    page: number,
    pageSize: number,
    range: ConsumptionRangeInput,
) =>
    useQuery({
        queryKey:
            "kind" in range
                ? queryKeys.consumption.latest(
                      targetType,
                      targetId ?? "",
                      bucketSize,
                      pageSize,
                      `${range.bucketSize}:${range.count}`,
                  )
                : queryKeys.consumption.list(
                      targetType,
                      targetId ?? "",
                      bucketSize,
                      page,
                      pageSize,
                      `${range.from.toISOString()}|${range.to.toISOString()}|${range.order ?? "desc"}`,
                  ),
        queryFn: () =>
            consumptionService.list({
                targetType,
                targetId: targetId!,
                granularity: bucketSize,
                page,
                pageSize,
                ...("kind" in range ? resolveLatestWindow(range.bucketSize, range.count) : range),
            }),
        enabled: Boolean(targetId),
    })

/** Janela do resumo: só os buckets que começam em `[from, to)` entram. */
export interface SummaryRange {
    from: Date
    to: Date
}

/** Mesma escolha de `ConsumptionRangeInput`: janela fixa na chave, ou "últimos N baldes". */
export type SummaryRangeInput = SummaryRange | LatestRange

/**
 * Opções da consulta do resumo, compartilhadas por quem consulta um lote
 * (`useConsumptionSummary`) e por quem consulta vários (`useQueries`).
 * `enabled: ids.length > 0` evita disparar a query com lote vazio (a lista de
 * propriedades/áreas/dispositivos ainda pode não ter carregado). A janela
 * fixa entra na chave, para trocar de dia ser outra consulta; a de
 * `latestRange` entra só com o tamanho (balde e N), e as datas saem no pedido.
 */
export const summaryQueryOptions = (
    targetType: TargetType,
    ids: string[],
    granularity: BucketSize,
    range: SummaryRangeInput,
) => ({
    queryKey: queryKeys.consumption.summary(
        targetType,
        ids,
        granularity,
        "kind" in range
            ? `latest:${range.bucketSize}:${range.count}`
            : `${range.from.toISOString()}|${range.to.toISOString()}`,
    ),
    queryFn: () =>
        consumptionService.summary({
            targetType,
            ids,
            granularity,
            ...("kind" in range ? resolveLatestWindow(range.bucketSize, range.count) : range),
        }),
    enabled: ids.length > 0,
})

/**
 * Endpoint batch — o último bucket de N alvos do mesmo `targetType`,
 * substituindo o padrão `useQueries` (1 chamada por alvo) que
 * `PropertyComparisonSection`, `AreasSection` e `DevicesSection` usavam.
 * O último bucket dentro da janela: quem não tem leitura nela fica fora do
 * resultado.
 */
export const useConsumptionSummary = (
    targetType: TargetType,
    ids: string[],
    granularity: BucketSize,
    range: SummaryRangeInput,
) => useQuery(summaryQueryOptions(targetType, ids, granularity, range))
