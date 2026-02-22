import { z } from "zod"

// ─── Login ────────────────────────────────────────────────────────────────────
// O campo `channel` é obrigatório porque ele determina duas coisas críticas:
//   1. Se o token terá `expiresAt` preenchido (WEB = sim, MOBILE = não)
//   2. O comportamento de renovação automática no futuro
export const loginSchema = z.object({
    email: z.email({ message: "E-mail inválido" }),
    password: z.string().min(1, { message: "Senha é obrigatória" }),
    channel: z.enum(["WEB", "MOBILE"], {
        error: "channel deve ser WEB ou MOBILE",
    }),
})

// ─── Logout ───────────────────────────────────────────────────────────────────
// O logout não precisa de body — o token vem pelo header Authorization.
// O schema aqui é apenas para formalizar o contrato (body vazio é válido).
export const logoutSchema = z.object({})

// ─── Forgot Password ──────────────────────────────────────────────────────────
// Recebe apenas o e-mail. Simples, mas essa simplicidade é proposital:
// a resposta NUNCA revela se o e-mail existe ou não (user enumeration prevention).
export const forgotPasswordSchema = z.object({
    email: z.email({ message: "E-mail inválido" }),
})

// ─── Reset Password ───────────────────────────────────────────────────────────
// O `token` é o UUID gerado e enviado por e-mail.
// A `newPassword` segue as mesmas regras de força do cadastro de usuário 
export const resetPasswordSchema = z.object({
    token: z.string().min(1, { message: "Token é obrigatório" }),
    newPassword: z
        .string()
        .min(8, { message: "A senha deve ter ao menos 8 caracteres" })
        .regex(/[A-Z]/, { message: "A senha deve conter ao menos uma letra maiúscula" })
        .regex(/[a-z]/, { message: "A senha deve conter ao menos uma letra minúscula" })
        .regex(/[0-9]/, { message: "A senha deve conter ao menos um número" }),
})

// ─── Tipos inferidos ──────────────────────────────────────────────────────────
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>