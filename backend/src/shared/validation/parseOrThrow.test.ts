import { describe, it, expect } from "vitest"
import { z } from "zod"
import { parseOrThrow } from "@/shared/validation/parseOrThrow.js"
import { ValidationError } from "@/shared/errors/AppError.js"

const schema = z.object({
    name: z.string().min(1, { message: "Nome é obrigatório" }),
})

describe("parseOrThrow", () => {
    it("retorna os dados tipados quando o input é válido", () => {
        expect(parseOrThrow(schema, { name: "Casa Principal" })).toEqual({ name: "Casa Principal" })
    })

    it("lança ValidationError com a primeira mensagem de campo do Zod", () => {
        expect(() => parseOrThrow(schema, { name: "" })).toThrow(ValidationError)
        expect(() => parseOrThrow(schema, { name: "" })).toThrow("Nome é obrigatório")
    })

    it("lança ValidationError com a mensagem genérica quando o erro não tem fieldErrors", () => {
        const rootRefinedSchema = z
            .object({ a: z.number(), b: z.number() })
            .refine((data) => data.a === data.b, { message: "a e b devem ser iguais" })

        expect(() => parseOrThrow(rootRefinedSchema, { a: 1, b: 2 })).toThrow(ValidationError)
        expect(() => parseOrThrow(rootRefinedSchema, { a: 1, b: 2 })).toThrow("Dados inválidos")
    })
})
