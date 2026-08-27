import type { BucketSize, Granularity } from "@/types/consumption.types"

/**
 * Bucket correspondente a cada granularidade: a granularidade escolhida pelo
 * usuário é a JANELA, e o bucket é o nível imediatamente mais fino. Selecionar
 * "Hora" significa "a hora corrente, minuto a minuto" — não "uma linha por
 * hora retrocedendo no tempo".
 */
const BUCKET_BY_GRANULARITY: Record<Granularity, BucketSize> = {
    hour: "minute",
    day: "hour",
    month: "day",
    year: "month",
}

/**
 * Legenda da janela ativa, por granularidade — mesma tradução janela/bucket
 * de `BUCKET_BY_GRANULARITY` acima, em texto pro usuário (`ConsumptionSection`,
 * exibida abaixo do título "Histórico de consumo").
 */
export const CONSUMPTION_WINDOW_DESCRIPTION: Record<Granularity, string> = {
    hour: "Consumo da hora corrente, minuto a minuto",
    day: "Consumo do dia corrente, hora a hora",
    month: "Consumo do mês corrente, dia a dia",
    year: "Consumo do ano corrente, mês a mês",
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

export interface MonthlyHistoryWindow {
    bucketSize: "day"
    from: Date
    to: Date
}

/**
 * Janela do histórico "Mensal" do painel — do dia 1 do mês corrente até
 * ONTEM, inclusive. Diferente de `resolveConsumptionWindow`
 * (que sempre inclui o instante corrente, ainda em andamento), esta janela
 * exclui **de propósito** o dia de hoje: ele está incompleto, e uma barra
 * baixa só porque o dia mal começou distorceria a leitura do gráfico.
 *
 * `to` é exclusivo, então cai no início de hoje — o dia de hoje nunca entra
 * no filtro `minuteStart < to` do backend.
 *
 * Mês recém-começado (dia 1, nenhum dia anterior fechado): `from` e `to`
 * coincidem, a API devolve zero buckets, e o `ConsumptionChart` mostra o
 * estado vazio que já existe — não é tratado como erro.
 */
export const resolveMonthlyHistoryWindow = (now: Date = new Date()): MonthlyHistoryWindow => ({
    bucketSize: "day",
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
})
