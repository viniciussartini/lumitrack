import type { BucketSize, Granularity } from "@/types/consumption.types"

/**
 * Bucket correspondente a cada granularidade: a granularidade escolhida pelo
 * usuário é a JANELA, e o bucket é o nível imediatamente mais fino. Selecionar
 * "Hora" significa "a hora corrente, minuto a minuto" — não "uma linha por
 * hora retrocedendo no tempo" (issue #226).
 */
const BUCKET_BY_GRANULARITY: Record<Granularity, BucketSize> = {
    hour: "minute",
    day: "hour",
    month: "day",
    year: "month",
}

export interface ConsumptionWindow {
    /** Valor do parâmetro `granularity` de `GET /api/consumption`. */
    bucketSize: BucketSize
    /** Início da janela, inclusivo. */
    from: Date
    /** Fim da janela, exclusivo (início da janela seguinte). */
    to: Date
}

/**
 * Traduz a granularidade selecionada na UI para a janela consultada na API.
 *
 * As bordas saem do calendário LOCAL do browser — mesma simplificação já
 * assumida em `dashboardKpis.ts`: o backend agrega em America/Sao_Paulo e o
 * produto é brasileiro, então local e SP coincidem na prática.
 *
 * `to` cai no início da janela seguinte (exclusivo, como o filtro do backend)
 * e por isso fica no futuro — inofensivo, já que não há leitura futura.
 */
export const resolveConsumptionWindow = (
    granularity: Granularity,
    now: Date = new Date(),
): ConsumptionWindow => {
    const year = now.getFullYear()
    const month = now.getMonth()
    const day = now.getDate()
    const hour = now.getHours()
    const bucketSize = BUCKET_BY_GRANULARITY[granularity]

    // O construtor de Date normaliza o estouro de cada campo (hora 24 vira o
    // dia seguinte, mês 12 vira janeiro do ano seguinte).
    switch (granularity) {
        case "hour":
            return {
                bucketSize,
                from: new Date(year, month, day, hour),
                to: new Date(year, month, day, hour + 1),
            }
        case "day":
            return {
                bucketSize,
                from: new Date(year, month, day),
                to: new Date(year, month, day + 1),
            }
        case "month":
            return {
                bucketSize,
                from: new Date(year, month, 1),
                to: new Date(year, month + 1, 1),
            }
        case "year":
            return {
                bucketSize,
                from: new Date(year, 0, 1),
                to: new Date(year + 1, 0, 1),
            }
    }
}
