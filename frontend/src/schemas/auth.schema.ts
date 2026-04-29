import { z } from "zod"

export const loginSchema = z.object({
email: z
        .string({ error: "E-mail é obrigatório" })
        .min(1, "E-mail é obrigatório")
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "E-mail inválido"),
    password: z
        .string({ error: "Senha é obrigatória" })
        .min(1, "Senha é obrigatória"),
})

export type LoginFormData = z.infer<typeof loginSchema>