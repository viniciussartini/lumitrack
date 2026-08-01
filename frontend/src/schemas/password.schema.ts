import { z } from "zod"

// Espelha backend/src/shared/validation/passwordSchema.ts — mantenha sincronizado.
// Compartilhado entre register.schema.ts e resetPassword.schema.ts (2º uso —
// extraído daqui para não duplicar as 5 regras).
export const passwordSchema = z
    .string()
    .min(8, { message: "A senha deve ter ao menos 8 caracteres" })
    .regex(/[A-Z]/, { message: "A senha deve conter ao menos uma letra maiúscula" })
    .regex(/[a-z]/, { message: "A senha deve conter ao menos uma letra minúscula" })
    .regex(/[0-9]/, { message: "A senha deve conter ao menos um número" })
    .regex(/[^A-Za-z0-9]/, { message: "A senha deve conter ao menos um caractere especial" })
