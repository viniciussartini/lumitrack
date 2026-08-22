import { describe, it, expect } from "vitest"
import { buildPaginationRange } from "@/lib/paginationRange"

describe("buildPaginationRange", () => {
    it("lista todas as páginas quando cabem sem elipse", () => {
        expect(buildPaginationRange(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it("página única devolve só ela", () => {
        expect(buildPaginationRange(1, 1)).toEqual([1])
    })

    it("no começo, elipse só à direita", () => {
        expect(buildPaginationRange(2, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20])
    })

    it("no fim, elipse só à esquerda", () => {
        expect(buildPaginationRange(19, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20])
    })

    it("no meio, elipse dos dois lados e a página corrente entre as vizinhas", () => {
        expect(buildPaginationRange(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20])
    })

    it("mantém largura constante em qualquer página de um total grande", () => {
        for (let page = 1; page <= 20; page++) {
            expect(buildPaginationRange(page, 20)).toHaveLength(7)
        }
    })

    it("sempre inclui a primeira e a última página", () => {
        for (let page = 1; page <= 20; page++) {
            const range = buildPaginationRange(page, 20)
            expect(range[0]).toBe(1)
            expect(range.at(-1)).toBe(20)
        }
    })

    it("nunca repete uma página nem troca um número por elipse na fronteira", () => {
        for (let total = 1; total <= 30; total++) {
            for (let page = 1; page <= total; page++) {
                const numbers = buildPaginationRange(page, total).filter(
                    (item): item is number => item !== "ellipsis",
                )
                expect(new Set(numbers).size).toBe(numbers.length)
                expect(numbers).toContain(page)
                expect([...numbers].sort((a, b) => a - b)).toEqual(numbers)
            }
        }
    })

    it("normaliza entradas fora da faixa em vez de quebrar", () => {
        expect(buildPaginationRange(0, 5)).toEqual([1, 2, 3, 4, 5])
        expect(buildPaginationRange(99, 5)).toEqual([1, 2, 3, 4, 5])
        expect(buildPaginationRange(1, 0)).toEqual([1])
    })
})
