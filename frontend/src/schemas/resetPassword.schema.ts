import { z } from "zod"
import { passwordSchema } from "@/schemas/password.schema"

export const resetPasswordSchema = z
    .object({
        password: passwordSchema,
        confirmPassword: z.string().min(1, "Confirme a senha"),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "As senhas não coincidem",
        path: ["confirmPassword"],
    })

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>
