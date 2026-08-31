import { z, type ZodType } from "zod"
import { ValidationError } from "@/shared/errors/AppError.js"

/**
 * Valida `input` contra `schema` e retorna os dados tipados, ou lança
 * `ValidationError` com a primeira mensagem de campo do Zod — fallback
 * genérico só quando o erro não tem `fieldErrors` (ex.: refinement de
 * nível raiz, sem `path`).
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input)

    if (!parsed.success) {
        // `T` genérico impede o TS de resolver o tipo condicional de
        // `fieldErrors` (vira `{}`) — o runtime sempre entrega
        // Record<string, string[]>, então o cast é seguro.
        const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>
        const firstError = Object.values(fieldErrors).flat()[0]
        throw new ValidationError(firstError ?? "Dados inválidos")
    }

    return parsed.data
}
