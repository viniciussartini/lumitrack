import { useSummaryItems, type SummaryItems } from "@/hooks/useSummaryItems"
import { resolveConsumptionWindow } from "@/lib/consumptionWindow"
import { collectTargetIds } from "@/lib/todayConsumption"
import type { PropertyTreeNode } from "@/types/property.types"

/**
 * Consumo de hoje da propriedade, das áreas e dos dispositivos dela.
 *
 * A janela é o dia corrente: com ela, o resumo só devolve quem tem leitura
 * hoje, e a ausência de um nó quer dizer "sem leitura hoje", não o consumo de
 * um dia anterior. A janela entra na chave da consulta, então a virada do dia
 * refaz os pedidos.
 */
export const useTodayConsumption = (property: PropertyTreeNode | undefined): SummaryItems => {
    const todayWindow = resolveConsumptionWindow("day")
    return useSummaryItems(property && collectTargetIds(property), "day", {
        from: todayWindow.from,
        to: todayWindow.to,
    })
}
