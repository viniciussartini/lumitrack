import { z } from "zod"

// Regra de força de senha compartilhada entre cadastro (user.schema.ts) e
// reset de senha (auth.schema.ts) — antes duplicada nos dois arquivos,
// o que exigia lembrar de atualizar os dois lugares a cada mudança de
// regra (#12 — A06: adicionou a exigência de caractere especial, gap
// citado pela auditoria).
export const passwordSchema = z
    .string()
    .min(8, { message: "A senha deve ter ao menos 8 caracteres" })
    .regex(/[A-Z]/, { message: "A senha deve conter ao menos uma letra maiúscula" })
    .regex(/[a-z]/, { message: "A senha deve conter ao menos uma letra minúscula" })
    .regex(/[0-9]/, { message: "A senha deve conter ao menos um número" })
    .regex(/[^A-Za-z0-9]/, { message: "A senha deve conter ao menos um caractere especial" })
