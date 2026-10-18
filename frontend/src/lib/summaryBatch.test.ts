import { describe, expect, it } from "vitest"
import { SUMMARY_MAX_IDS, chunkIds } from "@/lib/summaryBatch"

describe("chunkIds", () => {
    it("o teto do resumo é de 50 ids por pedido", () => {
        expect(SUMMARY_MAX_IDS).toBe(50)
    })

    it("até o teto é um pedido só", () => {
        const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`)

        expect(chunkIds(ids, SUMMARY_MAX_IDS)).toEqual([ids])
    })

    it("passou do teto, abre um pedido a mais, sem perder nem repetir id", () => {
        const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`)

        const chunks = chunkIds(ids, SUMMARY_MAX_IDS)

        expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 1])
        expect(chunks.flat()).toEqual(ids)
    })

    it("sem ids não há pedido", () => {
        expect(chunkIds([], SUMMARY_MAX_IDS)).toEqual([])
    })
})
