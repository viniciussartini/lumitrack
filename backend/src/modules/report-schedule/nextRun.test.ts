import { describe, it, expect } from "vitest"
import { computeNextRun } from "@/modules/report-schedule/nextRun.js"

// São Paulo é UTC-3: 06:00 local = 09:00 UTC.
const at = (iso: string) => new Date(iso)
const next = (
    frequency: Parameters<typeof computeNextRun>[0],
    sendDay: number | null,
    now: string,
) => computeNextRun(frequency, sendDay, at(now)).toISOString()

describe("computeNextRun — diária", () => {
    it("antes das 06:00 locais, envia hoje", () => {
        expect(next("DAILY", null, "2026-07-10T08:59:00.000Z")).toBe("2026-07-10T09:00:00.000Z")
    })

    it("a partir das 06:00 locais, envia amanhã", () => {
        expect(next("DAILY", null, "2026-07-10T09:00:00.000Z")).toBe("2026-07-11T09:00:00.000Z")
    })

    it("usa o dia local: 22:00 de São Paulo (01:00 UTC do dia seguinte) envia às 06:00 do dia local seguinte", () => {
        expect(next("DAILY", null, "2026-07-11T01:00:00.000Z")).toBe("2026-07-11T09:00:00.000Z")
    })

    it("antes das 06:00 locais mas já no dia seguinte em UTC, ainda é o mesmo dia local", () => {
        // 03:00 UTC do dia 11 = 00:00 local do dia 11 → envia às 06:00 locais do dia 11.
        expect(next("DAILY", null, "2026-07-11T03:00:00.000Z")).toBe("2026-07-11T09:00:00.000Z")
    })
})

describe("computeNextRun — semanal (1 = segunda … 7 = domingo)", () => {
    // 2026-07-10 é uma sexta-feira.
    it("dia da semana futuro nesta semana", () => {
        expect(next("WEEKLY", 7, "2026-07-10T12:00:00.000Z")).toBe("2026-07-12T09:00:00.000Z")
    })

    it("dia da semana já passado vai para a semana seguinte", () => {
        expect(next("WEEKLY", 1, "2026-07-10T12:00:00.000Z")).toBe("2026-07-13T09:00:00.000Z")
    })

    it("mesmo dia da semana: hoje se ainda não deu 06:00, senão daqui a 7 dias", () => {
        expect(next("WEEKLY", 5, "2026-07-10T08:00:00.000Z")).toBe("2026-07-10T09:00:00.000Z")
        expect(next("WEEKLY", 5, "2026-07-10T10:00:00.000Z")).toBe("2026-07-17T09:00:00.000Z")
    })
})

describe("computeNextRun — mensal", () => {
    it("dia ainda por vir neste mês", () => {
        expect(next("MONTHLY", 20, "2026-07-10T12:00:00.000Z")).toBe("2026-07-20T09:00:00.000Z")
    })

    it("dia já passado vai para o mês seguinte", () => {
        expect(next("MONTHLY", 5, "2026-07-10T12:00:00.000Z")).toBe("2026-08-05T09:00:00.000Z")
    })

    it("vira o ano em dezembro", () => {
        expect(next("MONTHLY", 5, "2026-12-10T12:00:00.000Z")).toBe("2027-01-05T09:00:00.000Z")
    })

    it("mês mais curto que o dia escolhido envia no último dia, sem estourar para o mês seguinte", () => {
        // 31 em fevereiro (não bissexto) → 28; em abril → 30.
        expect(next("MONTHLY", 31, "2026-02-10T12:00:00.000Z")).toBe("2026-02-28T09:00:00.000Z")
        expect(next("MONTHLY", 31, "2026-04-10T12:00:00.000Z")).toBe("2026-04-30T09:00:00.000Z")
        expect(next("MONTHLY", 30, "2026-02-10T12:00:00.000Z")).toBe("2026-02-28T09:00:00.000Z")
    })

    it("ano bissexto: 29, 30 e 31 caem em 29 de fevereiro", () => {
        for (const day of [29, 30, 31]) {
            expect(next("MONTHLY", day, "2028-02-10T12:00:00.000Z")).toBe(
                "2028-02-29T09:00:00.000Z",
            )
        }
    })

    it("depois do último dia do mês curto, segue para o mês seguinte com o dia cheio", () => {
        expect(next("MONTHLY", 31, "2026-02-28T12:00:00.000Z")).toBe("2026-03-31T09:00:00.000Z")
    })

    it("no próprio dia: hoje antes das 06:00, no mês seguinte depois", () => {
        expect(next("MONTHLY", 10, "2026-07-10T08:00:00.000Z")).toBe("2026-07-10T09:00:00.000Z")
        expect(next("MONTHLY", 10, "2026-07-10T09:00:00.000Z")).toBe("2026-08-10T09:00:00.000Z")
    })
})

describe("computeNextRun — trimestral (jan, abr, jul, out)", () => {
    it("no meio do trimestre, espera o início do próximo", () => {
        expect(next("QUARTERLY", 1, "2026-08-15T12:00:00.000Z")).toBe("2026-10-01T09:00:00.000Z")
    })

    it("no mês de envio, ainda dá tempo se o dia não passou", () => {
        expect(next("QUARTERLY", 20, "2026-07-10T12:00:00.000Z")).toBe("2026-07-20T09:00:00.000Z")
    })

    it("depois de outubro vai para janeiro do ano seguinte", () => {
        expect(next("QUARTERLY", 1, "2026-11-01T12:00:00.000Z")).toBe("2027-01-01T09:00:00.000Z")
    })

    it("dia 31 em abril envia no dia 30", () => {
        expect(next("QUARTERLY", 31, "2026-04-02T12:00:00.000Z")).toBe("2026-04-30T09:00:00.000Z")
    })
})

describe("computeNextRun — semestral (jan e jul)", () => {
    it("entre janeiro e julho, espera julho", () => {
        expect(next("SEMIANNUAL", 15, "2026-03-10T12:00:00.000Z")).toBe("2026-07-15T09:00:00.000Z")
    })

    it("depois de julho vai para janeiro do ano seguinte", () => {
        expect(next("SEMIANNUAL", 15, "2026-08-10T12:00:00.000Z")).toBe("2027-01-15T09:00:00.000Z")
    })
})

describe("computeNextRun — anual (janeiro)", () => {
    it("depois do envio deste ano, espera janeiro do próximo", () => {
        expect(next("ANNUAL", 10, "2026-01-20T12:00:00.000Z")).toBe("2027-01-10T09:00:00.000Z")
    })

    it("antes do envio deste ano, envia em janeiro", () => {
        expect(next("ANNUAL", 10, "2026-01-05T12:00:00.000Z")).toBe("2026-01-10T09:00:00.000Z")
    })

    it("virada do ano em São Paulo: 31/12 às 23:00 locais já aponta para janeiro seguinte", () => {
        expect(next("ANNUAL", 1, "2027-01-01T02:00:00.000Z")).toBe("2027-01-01T09:00:00.000Z")
    })
})

describe("computeNextRun — entrada inválida", () => {
    it("falha fechado se a frequência exige dia e ele não veio", () => {
        expect(() => computeNextRun("MONTHLY", null, new Date())).toThrow()
        expect(() => computeNextRun("WEEKLY", null, new Date())).toThrow()
    })
})
