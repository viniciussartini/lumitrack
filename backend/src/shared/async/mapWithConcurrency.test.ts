import { describe, it, expect } from "vitest"
import { mapWithConcurrency } from "@/shared/async/mapWithConcurrency.js"

describe("mapWithConcurrency", () => {
    it("mantém a ordem dos resultados", async () => {
        const result = await mapWithConcurrency([30, 5, 15], 2, async (ms, i) => {
            await new Promise((resolve) => setTimeout(resolve, ms))
            return i
        })

        expect(result).toEqual([0, 1, 2])
    })

    it("nunca passa do limite de chamadas simultâneas", async () => {
        let running = 0
        let peak = 0

        await mapWithConcurrency(
            Array.from({ length: 12 }, (_, i) => i),
            3,
            async () => {
                running++
                peak = Math.max(peak, running)
                await new Promise((resolve) => setTimeout(resolve, 2))
                running--
            },
        )

        expect(peak).toBe(3)
    })

    it("lista vazia devolve lista vazia", async () => {
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
    })

    it("a primeira falha rejeita e os itens que não começaram não rodam", async () => {
        const started: number[] = []

        await expect(
            mapWithConcurrency([0, 1, 2, 3, 4, 5], 1, async (n) => {
                started.push(n)
                if (n === 2) throw new Error("falha")
                return n
            }),
        ).rejects.toThrow("falha")

        expect(started).toEqual([0, 1, 2])
    })
})
