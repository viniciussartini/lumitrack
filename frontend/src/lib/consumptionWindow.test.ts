import { describe, it, expect } from "vitest"
import {
    describeConsumptionWindow,
    resolveConsumptionWindow,
    resolveMonthlyHistoryWindow,
} from "@/lib/consumptionWindow"

// Instante de referência fixo (21/08/2026 às 19:45) usado como "agora" em
// todos os casos abaixo, para manter os testes determinísticos.
const NOW = new Date(2026, 7, 21, 19, 45, 30)

describe("resolveConsumptionWindow", () => {
    it("hora → buckets de minuto, da hora cheia até a hora seguinte", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("hour", NOW)

        expect(bucketSize).toBe("minute")
        expect(from).toEqual(new Date(2026, 7, 21, 19, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 21, 20, 0, 0, 0))
    })

    it("dia → buckets de hora, da meia-noite ao início do dia seguinte", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("day", NOW)

        expect(bucketSize).toBe("hour")
        expect(from).toEqual(new Date(2026, 7, 21, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 22, 0, 0, 0, 0))
    })

    it("mês → buckets de dia, do dia 1 ao início do mês seguinte", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("month", NOW)

        expect(bucketSize).toBe("day")
        expect(from).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
    })

    it("ano → buckets de mês, de 1º de janeiro ao início do ano seguinte", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("year", NOW)

        expect(bucketSize).toBe("month")
        expect(from).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0))
    })

    it("vira o dia quando a janela de hora começa às 23h", () => {
        const { from, to } = resolveConsumptionWindow("hour", new Date(2026, 7, 21, 23, 10))

        expect(from).toEqual(new Date(2026, 7, 21, 23, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 22, 0, 0, 0, 0))
    })

    it("vira o ano quando a janela de mês é dezembro", () => {
        const { from, to } = resolveConsumptionWindow("month", new Date(2026, 11, 31, 23, 59))

        expect(from).toEqual(new Date(2026, 11, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0))
    })

    it("hora com selectedHour → usa a hora escolhida em vez da hora corrente de `now`", () => {
        const { bucketSize, from, to } = resolveConsumptionWindow("hour", NOW, 14)

        expect(bucketSize).toBe("minute")
        expect(from).toEqual(new Date(2026, 7, 21, 14, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 21, 15, 0, 0, 0))
    })

    it("selectedHour é ignorado para as demais granularidades", () => {
        const { from, to } = resolveConsumptionWindow("day", NOW, 14)

        expect(from).toEqual(new Date(2026, 7, 21, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 22, 0, 0, 0, 0))
    })
})

describe("describeConsumptionWindow", () => {
    it("hora selecionada igual à corrente → legenda de 'hora corrente'", () => {
        expect(describeConsumptionWindow("hour", 19, 19)).toBe(
            "Consumo da hora corrente, minuto a minuto",
        )
    })

    it("hora selecionada diferente da corrente → legenda cita a janela escolhida", () => {
        expect(describeConsumptionWindow("hour", 14, 19)).toBe(
            "Consumo de 14h às 15h, minuto a minuto",
        )
    })

    it("demais granularidades ignoram os parâmetros de hora", () => {
        expect(describeConsumptionWindow("day", 14, 19)).toBe(
            "Consumo do dia corrente, hora a hora",
        )
        expect(describeConsumptionWindow("month", 14, 19)).toBe(
            "Consumo do mês corrente, dia a dia",
        )
        expect(describeConsumptionWindow("year", 14, 19)).toBe("Consumo do ano corrente, mês a mês")
    })
})

describe("resolveMonthlyHistoryWindow", () => {
    it("do dia 1 do mês até ONTEM, inclusive — hoje fica de fora por estar incompleto", () => {
        const { bucketSize, from, to } = resolveMonthlyHistoryWindow(NOW)

        expect(bucketSize).toBe("day")
        expect(from).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0))
        // `to` exclusivo: dia 21 (hoje) fica de fora, dia 20 (ontem) é o
        // último incluído.
        expect(to).toEqual(new Date(2026, 7, 21, 0, 0, 0, 0))
    })

    it("mês com poucos dias decorridos mostra só os dias fechados", () => {
        const { from, to } = resolveMonthlyHistoryWindow(new Date(2026, 7, 3, 10, 0))

        expect(from).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 7, 3, 0, 0, 0, 0))
    })

    it("dia 1 do mês: janela vazia (nenhum dia fechado ainda)", () => {
        const { from, to } = resolveMonthlyHistoryWindow(new Date(2026, 8, 1, 9, 0))

        expect(from).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
        expect(from.getTime()).toBe(to.getTime())
    })

    it("vira o ano quando o mês corrente é janeiro", () => {
        const { from, to } = resolveMonthlyHistoryWindow(new Date(2027, 0, 15, 12, 0))

        expect(from).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0))
        expect(to).toEqual(new Date(2027, 0, 15, 0, 0, 0, 0))
    })
})
