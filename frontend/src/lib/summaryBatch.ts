import type { TargetType } from "@/types/meter.types"

/** Teto de ids por pedido de `GET /api/consumption/summary`. */
export const SUMMARY_MAX_IDS = 50

/** Ids por tipo de alvo: o resumo aceita um tipo só por pedido. */
export type TargetIds = Record<TargetType, string[]>

/** Divide os ids em pedidos de no máximo `size`, na ordem recebida. */
export const chunkIds = (ids: readonly string[], size: number): string[][] =>
    Array.from({ length: Math.ceil(ids.length / size) }, (_, index) =>
        ids.slice(index * size, (index + 1) * size),
    )
