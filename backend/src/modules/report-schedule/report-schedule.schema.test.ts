import { describe, it, expect } from "vitest"
import {
    MAX_RECIPIENTS,
    reportScheduleBodySchema,
} from "@/modules/report-schedule/report-schedule.schema.js"

const targetId = "3f2b8c1e-9d4a-4c6e-8f21-0a1b2c3d4e5f"

const valid = {
    targetType: "PROPERTY",
    targetId,
    type: "CONSUMPTION",
    format: "PDF",
    frequency: "MONTHLY",
    sendDay: 5,
    recipients: ["financeiro@example.com"],
}

const parse = (override: Record<string, unknown> = {}) =>
    reportScheduleBodySchema.safeParse({ ...valid, ...override })

describe("reportScheduleBodySchema", () => {
    it("aceita uma configuração válida e assume ativa por padrão", () => {
        const result = parse()
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.active).toBe(true)
    })

    describe("dia do envio conforme a frequência", () => {
        it("diária não tem dia: aceita ausente ou nulo e normaliza para null", () => {
            for (const sendDay of [undefined, null]) {
                const result = parse({ frequency: "DAILY", sendDay })
                expect(result.success).toBe(true)
                if (result.success) expect(result.data.sendDay).toBeNull()
            }
        })

        it("diária rejeita dia informado", () => {
            expect(parse({ frequency: "DAILY", sendDay: 1 }).success).toBe(false)
        })

        it("semanal aceita 1 a 7 e rejeita 0 e 8", () => {
            expect(parse({ frequency: "WEEKLY", sendDay: 1 }).success).toBe(true)
            expect(parse({ frequency: "WEEKLY", sendDay: 7 }).success).toBe(true)
            expect(parse({ frequency: "WEEKLY", sendDay: 0 }).success).toBe(false)
            expect(parse({ frequency: "WEEKLY", sendDay: 8 }).success).toBe(false)
        })

        it.each(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"])(
            "%s aceita 1 a 31 e rejeita 0, 32 e ausente",
            (frequency) => {
                expect(parse({ frequency, sendDay: 1 }).success).toBe(true)
                expect(parse({ frequency, sendDay: 31 }).success).toBe(true)
                expect(parse({ frequency, sendDay: 0 }).success).toBe(false)
                expect(parse({ frequency, sendDay: 32 }).success).toBe(false)
                expect(parse({ frequency, sendDay: null }).success).toBe(false)
                expect(parse({ frequency, sendDay: undefined }).success).toBe(false)
            },
        )

        it("rejeita dia fracionário", () => {
            expect(parse({ sendDay: 5.5 }).success).toBe(false)
        })
    })

    describe("tipo × frequência", () => {
        it("o relatório mensal só combina com a frequência mensal", () => {
            expect(parse({ type: "MONTHLY", frequency: "MONTHLY" }).success).toBe(true)
            expect(parse({ type: "MONTHLY", frequency: "WEEKLY", sendDay: 1 }).success).toBe(false)
            expect(parse({ type: "MONTHLY", frequency: "DAILY", sendDay: null }).success).toBe(
                false,
            )
        })

        it("o relatório de consumo combina com qualquer frequência", () => {
            expect(parse({ type: "CONSUMPTION", frequency: "ANNUAL", sendDay: 10 }).success).toBe(
                true,
            )
        })

        it("o relatório de demanda só combina com a frequência mensal", () => {
            expect(parse({ type: "DEMAND", frequency: "MONTHLY" }).success).toBe(true)
            expect(parse({ type: "DEMAND", frequency: "WEEKLY", sendDay: 1 }).success).toBe(false)
            expect(parse({ type: "DEMAND", frequency: "ANNUAL", sendDay: 1 }).success).toBe(false)
        })

        it.each(["ALERTS", "POWER_QUALITY"])("%s combina com qualquer frequência", (type) => {
            expect(parse({ type, frequency: "WEEKLY", sendDay: 1 }).success).toBe(true)
            expect(parse({ type, frequency: "DAILY", sendDay: null }).success).toBe(true)
        })

        it("rejeita tipo desconhecido", () => {
            expect(parse({ type: "OUTRO" }).success).toBe(false)
        })
    })

    describe("destinatários", () => {
        it("exige ao menos um", () => {
            expect(parse({ recipients: [] }).success).toBe(false)
        })

        it("aceita até o teto e rejeita acima dele", () => {
            const at = (n: number) => Array.from({ length: n }, (_, i) => `pessoa${i}@example.com`)
            expect(parse({ recipients: at(MAX_RECIPIENTS) }).success).toBe(true)
            expect(parse({ recipients: at(MAX_RECIPIENTS + 1) }).success).toBe(false)
        })

        it("rejeita e-mail inválido", () => {
            expect(parse({ recipients: ["sem-arroba"] }).success).toBe(false)
            expect(parse({ recipients: ["a@example.com", "b@"] }).success).toBe(false)
        })

        it("normaliza para minúsculas, sem espaços, e remove repetidos", () => {
            const result = parse({
                recipients: [
                    " Financeiro@Example.com ",
                    "financeiro@example.com",
                    "ceo@example.com",
                ],
            })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.recipients).toEqual([
                    "financeiro@example.com",
                    "ceo@example.com",
                ])
            }
        })

        it("rejeita e-mail acima de 254 caracteres", () => {
            const local = "a".repeat(250)
            expect(parse({ recipients: [`${local}@example.com`] }).success).toBe(false)
        })
    })

    it("rejeita formato desconhecido e alvo inválido", () => {
        expect(parse({ format: "XLSX" }).success).toBe(false)
        expect(parse({ targetId: "nao-e-uuid" }).success).toBe(false)
    })
})
