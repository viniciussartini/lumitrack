import { describe, it, expect } from "vitest"
import { paginationQuerySchema, toPaginated, toSkipTake } from "@/shared/pagination.js"

describe("paginationQuerySchema", () => {
    it("aplica os defaults page=1 e pageSize=10 quando ausentes", () => {
        const parsed = paginationQuerySchema.parse({})
        expect(parsed).toEqual({ page: 1, pageSize: 10 })
    })

    it("aceita page e pageSize como strings de query param e converte para número", () => {
        const parsed = paginationQuerySchema.parse({ page: "2", pageSize: "31" })
        expect(parsed).toEqual({ page: 2, pageSize: 31 })
    })

    it("rejeita pageSize acima de 31", () => {
        expect(() => paginationQuerySchema.parse({ pageSize: 32 })).toThrow()
    })

    it("rejeita page menor que 1", () => {
        expect(() => paginationQuerySchema.parse({ page: 0 })).toThrow()
    })

    it("rejeita pageSize menor que 1", () => {
        expect(() => paginationQuerySchema.parse({ pageSize: 0 })).toThrow()
    })
})

describe("toSkipTake", () => {
    it("calcula skip=0 para a primeira página", () => {
        expect(toSkipTake({ page: 1, pageSize: 10 })).toEqual({ skip: 0, take: 10 })
    })

    it("calcula skip proporcional à página", () => {
        expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 })
    })
})

describe("toPaginated", () => {
    it("monta o envelope com items, total, page e pageSize", () => {
        const result = toPaginated(["a", "b"], 25, { page: 2, pageSize: 2 })
        expect(result).toEqual({ items: ["a", "b"], total: 25, page: 2, pageSize: 2 })
    })
})
