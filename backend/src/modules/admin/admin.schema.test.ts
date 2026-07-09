import { describe, it, expect } from "vitest"
import { auditLogQuerySchema } from "@/modules/admin/admin.schema.js"

describe("auditLogQuerySchema", () => {
    it("aceita query vazia, aplicando defaults de paginação", () => {
        const result = auditLogQuerySchema.safeParse({})

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.page).toBe(1)
            expect(result.data.pageSize).toBe(50)
        }
    })

    it("rejeita action fora do enum", () => {
        const result = auditLogQuerySchema.safeParse({ action: "NOT_A_REAL_ACTION" })
        expect(result.success).toBe(false)
    })

    it("rejeita outcome fora do enum", () => {
        const result = auditLogQuerySchema.safeParse({ outcome: "MAYBE" })
        expect(result.success).toBe(false)
    })

    it("rejeita userId que não é UUID", () => {
        const result = auditLogQuerySchema.safeParse({ userId: "not-a-uuid" })
        expect(result.success).toBe(false)
    })

    it("aceita e coage from/to no formato de data (YYYY-MM-DD)", () => {
        const result = auditLogQuerySchema.safeParse({ from: "2026-01-01", to: "2026-06-30" })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.from).toBeInstanceOf(Date)
            expect(result.data.to).toBeInstanceOf(Date)
        }
    })

    it("rejeita pageSize acima do teto (200)", () => {
        const result = auditLogQuerySchema.safeParse({ pageSize: "500" })
        expect(result.success).toBe(false)
    })

    it("rejeita page abaixo de 1", () => {
        const result = auditLogQuerySchema.safeParse({ page: "0" })
        expect(result.success).toBe(false)
    })
})
