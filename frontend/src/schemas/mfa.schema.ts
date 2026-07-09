import { z } from "zod"

// Compartilhado pelo segundo passo do login e pela confirmação do setup —
// o backend aceita o mesmo formato de campo nos dois casos: um código TOTP
// de 6 dígitos OU um código de backup (formato XXXXX-XXXXX).
export const mfaCodeSchema = z.object({
    code: z
        .string({ error: "Código é obrigatório" })
        .min(1, "Código é obrigatório"),
})

export type MfaCodeFormData = z.infer<typeof mfaCodeSchema>

export const mfaDisableSchema = z.object({
    password: z
        .string({ error: "Senha é obrigatória" })
        .min(1, "Senha é obrigatória"),
    code: z
        .string({ error: "Código é obrigatório" })
        .min(1, "Código é obrigatório"),
})

export type MfaDisableFormData = z.infer<typeof mfaDisableSchema>
