import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { PldQuoteService } from "@/modules/pld-quote/pld-quote.service.js"
import { PldQuoteRepository } from "@/modules/pld-quote/pld-quote.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const pldQuoteRepository = new PldQuoteRepository(prismaTest)
const pldQuoteService = new PldQuoteService(pldQuoteRepository)

async function createQuote(overrides: {
    submarket?: "NORTH" | "NORTHEAST" | "SOUTHEAST_CENTER_WEST" | "SOUTH"
    referencePeriod?: Date
    valuePerMwh?: number
}) {
    return prismaTest.pldQuote.create({
        data: {
            submarket: overrides.submarket ?? "SOUTHEAST_CENTER_WEST",
            referencePeriod: overrides.referencePeriod ?? new Date("2026-08-01"),
            valuePerMwh: overrides.valuePerMwh ?? 186.4,
        },
    })
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: PldQuoteService — catálogo global somente leitura
// ─────────────────────────────────────────────────────────────────────────────

describe("PldQuoteService", () => {
    describe("findAll", () => {
        it("deve retornar lista vazia quando não há cotações no catálogo", async () => {
            const result = await pldQuoteService.findAll({})
            expect(result.items).toEqual([])
            expect(result.total).toBe(0)
        })

        it("deve retornar cotações ordenadas pelo período mais recente primeiro, com valor numérico", async () => {
            await createQuote({ referencePeriod: new Date("2026-06-01"), valuePerMwh: 98.75 })
            await createQuote({ referencePeriod: new Date("2026-08-01"), valuePerMwh: 186.4 })
            await createQuote({ referencePeriod: new Date("2026-07-01"), valuePerMwh: 154.22 })

            const result = await pldQuoteService.findAll({})

            expect(result.items.map((q) => q.valuePerMwh)).toEqual([186.4, 154.22, 98.75])
            expect(typeof result.items[0]?.valuePerMwh).toBe("number")
        })

        it("deve filtrar por submercado", async () => {
            await createQuote({ submarket: "SOUTHEAST_CENTER_WEST" })
            await createQuote({ submarket: "SOUTH", referencePeriod: new Date("2026-07-01") })

            const result = await pldQuoteService.findAll({ submarket: "SOUTH" })

            expect(result.total).toBe(1)
            expect(result.items[0]?.submarket).toBe("SOUTH")
        })

        it("deve filtrar por janela de período (from/to)", async () => {
            await createQuote({ referencePeriod: new Date("2026-06-01") })
            await createQuote({ referencePeriod: new Date("2026-07-01") })
            await createQuote({ referencePeriod: new Date("2026-08-01") })

            const result = await pldQuoteService.findAll({ from: "2026-07-01", to: "2026-07-31" })

            expect(result.total).toBe(1)
            expect(result.items[0]?.referencePeriod).toEqual(new Date("2026-07-01"))
        })

        it("deve paginar respeitando page e pageSize", async () => {
            for (let i = 1; i <= 5; i++) {
                await createQuote({ referencePeriod: new Date(`2026-0${i}-01`) })
            }

            const result = await pldQuoteService.findAll({ page: 2, pageSize: 2 })

            expect(result.items).toHaveLength(2)
            expect(result.total).toBe(5)
            expect(result.page).toBe(2)
            expect(result.pageSize).toBe(2)
        })

        it("deve lançar ValidationError para submercado inválido", async () => {
            await expect(pldQuoteService.findAll({ submarket: "LESTE" })).rejects.toThrow(
                ValidationError,
            )
        })

        it("deve lançar ValidationError para pageSize acima do teto (31)", async () => {
            await expect(pldQuoteService.findAll({ pageSize: 32 })).rejects.toThrow(ValidationError)
        })
    })
})
