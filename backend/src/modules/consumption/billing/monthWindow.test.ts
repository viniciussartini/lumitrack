import { describe, it, expect } from "vitest"
import type { AclContractResponse } from "@/modules/acl-contract/acl-contract.repository.js"
import {
    groupRowsByMs,
    resolveAclContractForMonth,
    resolveMonthWindow,
} from "@/modules/consumption/billing/monthWindow.js"

const SP_OFFSET_MS = 3 * 60 * 60 * 1000

describe("resolveMonthWindow", () => {
    it("converte a faixa de meses locais para instantes UTC reais, do primeiro ao fim do último mês", () => {
        const window = resolveMonthWindow([
            new Date(Date.UTC(2026, 6, 1)),
            new Date(Date.UTC(2026, 4, 1)),
            new Date(Date.UTC(2026, 5, 1)),
        ])

        expect(window.minMonthStart).toEqual(new Date(Date.UTC(2026, 4, 1)))
        expect(window.maxMonthEnd).toEqual(new Date(Date.UTC(2026, 7, 1)))
        expect(window.from.getTime()).toBe(Date.UTC(2026, 4, 1) + SP_OFFSET_MS)
        expect(window.to.getTime()).toBe(Date.UTC(2026, 7, 1) + SP_OFFSET_MS)
    })

    it("devolve o início de cada mês como instante UTC real, na ordem recebida", () => {
        const { periodStarts } = resolveMonthWindow([
            new Date(Date.UTC(2026, 11, 1)),
            new Date(Date.UTC(2026, 10, 1)),
        ])

        expect(periodStarts.map((d) => d.getTime())).toEqual([
            Date.UTC(2026, 11, 1) + SP_OFFSET_MS,
            Date.UTC(2026, 10, 1) + SP_OFFSET_MS,
        ])
    })

    it("a janela cruza a virada de ano sem perder o último mês", () => {
        const { maxMonthEnd } = resolveMonthWindow([new Date(Date.UTC(2026, 11, 1))])

        expect(maxMonthEnd).toEqual(new Date(Date.UTC(2027, 0, 1)))
    })
})

describe("groupRowsByMs", () => {
    it("agrupa as linhas pelo instante, mantendo a ordem dentro de cada grupo", () => {
        const rows = [
            { ms: 1, v: "a" },
            { ms: 2, v: "b" },
            { ms: 1, v: "c" },
        ]

        const grouped = groupRowsByMs(rows, (r) => r.ms)

        expect(grouped.get(1)?.map((r) => r.v)).toEqual(["a", "c"])
        expect(grouped.get(2)?.map((r) => r.v)).toEqual(["b"])
        expect(grouped.get(3)).toBeUndefined()
    })
})

describe("resolveAclContractForMonth", () => {
    const contract = (id: string, validFrom: string, validTo: string | null) =>
        ({
            id,
            validFrom: new Date(validFrom),
            validTo: validTo ? new Date(validTo) : null,
        }) as unknown as AclContractResponse

    it("escolhe o primeiro contrato cuja vigência cobre o mês (o mais recente prevalece)", () => {
        const contracts = [
            contract("novo", "2026-03-01", null),
            contract("antigo", "2025-01-01", "2026-12-31"),
        ]

        expect(resolveAclContractForMonth(contracts, new Date("2026-05-01"))?.id).toBe("novo")
    })

    it("devolve undefined para o mês sem contrato vigente, em vez de falhar", () => {
        const contracts = [contract("c", "2026-03-01", "2026-04-30")]

        expect(resolveAclContractForMonth(contracts, new Date("2026-02-01"))).toBeUndefined()
        expect(resolveAclContractForMonth(contracts, new Date("2026-05-01"))).toBeUndefined()
    })
})
