import { z } from "zod"

export const forgotPasswordSchema = z.object({
    email: z
        .string()
        .min(1, "E-mail é obrigatório")
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "E-mail inválido"),
})

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>
