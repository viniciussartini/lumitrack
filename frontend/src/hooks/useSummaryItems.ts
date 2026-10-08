import { useQueries } from "@tanstack/react-query"
import { summaryQueryOptions, type SummaryRange } from "@/hooks/queries/useConsumption"
import { SUMMARY_MAX_IDS, chunkIds, type TargetIds } from "@/lib/summaryBatch"
import type { BucketSize, ConsumptionSummaryItem } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"

const TARGET_TYPES: readonly TargetType[] = ["PROPERTY", "AREA", "DEVICE"]

export interface SummaryItems {
    /** Resumo por id do alvo; quem não tem medidor ou leitura na janela não está no mapa. */
    byId: ReadonlyMap<string, ConsumptionSummaryItem>
    isLoading: boolean
    isError: boolean
    /** Refaz só os pedidos que falharam. */
    refetch: () => void
}

/**
 * Resumo de consumo de vários alvos de tipos diferentes. O endpoint aceita um
 * tipo de alvo e até 50 ids por pedido, então são um pedido por tipo com ids,
 * mais um por lote de 50 quando passa disso — a contagem só cresce com a
 * quantidade de ids, nunca com o que a tela mostra.
 *
 * @param targetIds - Ids por tipo de alvo; tipo ausente ou vazio não gera pedido.
 * @param granularity - Tamanho do bucket do resumo.
 * @param range - Janela: quem não tem leitura nela fica fora do resultado.
 */
export const useSummaryItems = (
    targetIds: Partial<TargetIds> | undefined,
    granularity: BucketSize,
    range: SummaryRange,
): SummaryItems => {
    const requests = TARGET_TYPES.flatMap((targetType) =>
        chunkIds(targetIds?.[targetType] ?? [], SUMMARY_MAX_IDS).map((ids) => ({
            targetType,
            ids,
        })),
    )

    const queries = useQueries({
        queries: requests.map(({ targetType, ids }) =>
            summaryQueryOptions(targetType, ids, granularity, range),
        ),
    })

    const byId = new Map<string, ConsumptionSummaryItem>()
    for (const query of queries) {
        for (const item of query.data?.items ?? []) byId.set(item.id, item)
    }

    return {
        byId,
        isLoading: queries.some((query) => query.isLoading),
        isError: queries.some((query) => query.isError),
        refetch: () => {
            for (const query of queries) if (query.isError) void query.refetch()
        },
    }
}
