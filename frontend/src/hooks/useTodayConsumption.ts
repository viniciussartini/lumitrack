import { useQueries } from "@tanstack/react-query"
import { summaryQueryOptions } from "@/hooks/queries/useConsumption"
import { resolveConsumptionWindow } from "@/lib/consumptionWindow"
import { SUMMARY_MAX_IDS, chunkIds, collectTargetIds } from "@/lib/todayConsumption"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"
import type { PropertyTreeNode } from "@/types/property.types"

const TARGET_TYPES: readonly TargetType[] = ["PROPERTY", "AREA", "DEVICE"]

export interface TodayConsumption {
    /** Resumo do dia por id do nó; quem não tem medidor ou leitura hoje não está no mapa. */
    byId: ReadonlyMap<string, ConsumptionSummaryItem>
    isLoading: boolean
    isError: boolean
    refetch: () => void
}

/**
 * Consumo de hoje da propriedade, das áreas e dos dispositivos dela. O resumo
 * aceita um tipo de alvo e até 50 ids por pedido, então são três pedidos (um
 * por tipo), mais um por lote de 50 quando a propriedade passa disso — a
 * contagem não cresce com a quantidade de nós expandidos.
 *
 * A janela é o dia corrente: com ela, o resumo só devolve quem tem leitura
 * hoje, e a ausência de um nó quer dizer "sem leitura hoje", não o consumo de
 * um dia anterior. A janela entra na chave da consulta, então a virada do dia
 * refaz os pedidos.
 */
export const useTodayConsumption = (property: PropertyTreeNode | undefined): TodayConsumption => {
    const todayWindow = resolveConsumptionWindow("day")
    const targetIds = property ? collectTargetIds(property) : undefined

    const requests = TARGET_TYPES.flatMap((targetType) =>
        chunkIds(targetIds?.[targetType] ?? [], SUMMARY_MAX_IDS).map((ids) => ({
            targetType,
            ids,
        })),
    )

    const queries = useQueries({
        queries: requests.map(({ targetType, ids }) =>
            summaryQueryOptions(targetType, ids, "day", {
                from: todayWindow.from,
                to: todayWindow.to,
            }),
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
