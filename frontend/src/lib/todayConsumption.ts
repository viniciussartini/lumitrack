import { formatCostBrl, formatKwh } from "@/lib/formatters/consumption"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { TargetIds } from "@/lib/summaryBatch"
import type { PropertyTreeNode } from "@/types/property.types"

/**
 * Ids da propriedade, das áreas e dos dispositivos dela, separados por tipo de
 * alvo: o resumo aceita um tipo só por pedido.
 */
export const collectTargetIds = (property: PropertyTreeNode): TargetIds => ({
    PROPERTY: [property.id],
    AREA: property.areas.map((area) => area.id),
    DEVICE: property.areas.flatMap((area) => area.devices.map((device) => device.id)),
})

/**
 * Consumo do dia de um nó. Sem item (sem medidor, ou medidor sem leitura hoje)
 * é ausência, "-", e não 0 kWh.
 */
export const formatTodayKwh = (item: ConsumptionSummaryItem | undefined): string =>
    item === undefined ? "-" : `${formatKwh(item.kwhConsumed)} kWh`

/** Custo do dia de um nó; "-" quando o custo não é calculável para o nó e a tarifa. */
export const formatTodayCost = (item: ConsumptionSummaryItem | undefined): string =>
    formatCostBrl(item?.costBrl)
