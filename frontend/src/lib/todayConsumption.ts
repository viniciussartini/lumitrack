import { formatCostBrl, formatKwh } from "@/lib/formatters/consumption"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"
import type { PropertyTreeNode } from "@/types/property.types"

/** Teto de ids por pedido de `GET /api/consumption/summary`. */
export const SUMMARY_MAX_IDS = 50

export type TargetIds = Record<TargetType, string[]>

/**
 * Ids da propriedade, das áreas e dos dispositivos dela, separados por tipo de
 * alvo: o resumo aceita um tipo só por pedido.
 */
export const collectTargetIds = (property: PropertyTreeNode): TargetIds => ({
    PROPERTY: [property.id],
    AREA: property.areas.map((area) => area.id),
    DEVICE: property.areas.flatMap((area) => area.devices.map((device) => device.id)),
})

/** Divide os ids em pedidos de no máximo `size`, na ordem recebida. */
export const chunkIds = (ids: readonly string[], size: number): string[][] =>
    Array.from({ length: Math.ceil(ids.length / size) }, (_, index) =>
        ids.slice(index * size, (index + 1) * size),
    )

/**
 * Consumo do dia de um nó. Sem item (sem medidor, ou medidor sem leitura hoje)
 * é ausência, "-", e não 0 kWh.
 */
export const formatTodayKwh = (item: ConsumptionSummaryItem | undefined): string =>
    item === undefined ? "-" : `${formatKwh(item.kwhConsumed)} kWh`

/** Custo do dia de um nó; "-" quando o custo não é calculável para o nó e a tarifa. */
export const formatTodayCost = (item: ConsumptionSummaryItem | undefined): string =>
    formatCostBrl(item?.costBrl)
