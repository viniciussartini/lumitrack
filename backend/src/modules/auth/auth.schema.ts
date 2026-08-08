import { z } from "zod"
import { passwordSchema } from "@/shared/validation/passwordSchema.js"

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

// ─── Demo login (issue #179) ───────────────────────────────────────────────────
// Sem senha: o cliente escolhe só o `profile`, o backend resolve o e-mail
// fixo internamente (shared/config/demoAccounts.ts) — nenhuma credencial
// trafega nem existe no frontend.
export const demoLoginSchema = z.object({
    profile: z.enum(["residential", "commercial"], {
        error: "profile deve ser residential ou commercial",
    }),
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
    newPassword: passwordSchema,
})

// ─── MFA — login (segunda etapa) ───────────────────────────────────────────────
// Completa o login após `mfaRequired:true` — `mfaToken` é o JWT de curta
// duração (5min) emitido por login() quando o usuário tem MFA habilitado;
// `code` pode ser um código TOTP de 6 dígitos OU um backup code.
export const mfaLoginVerifySchema = z.object({
    mfaToken: z.string().min(1, { message: "mfaToken é obrigatório" }),
    code: z.string().min(1, { message: "Código é obrigatório" }),
})

// ─── MFA — confirmação do setup ────────────────────────────────────────────────
// O secret volta do cliente (foi devolvido por POST /mfa/setup) junto com
// o código gerado pelo app autenticador, confirmando que o usuário
// escaneou o QR corretamente antes de persistir o secret/habilitar o MFA.
export const mfaSetupVerifySchema = z.object({
    secret: z.string().min(1, { message: "secret é obrigatório" }),
    code: z.string().min(1, { message: "Código é obrigatório" }),
})

// ─── MFA — desabilitar ──────────────────────────────────────────────────────────
// Exige senha + código válido (TOTP ou backup code) — uma sessão sozinha
// não deve ser suficiente para desabilitar o segundo fator.
export const mfaDisableSchema = z.object({
    password: z.string().min(1, { message: "Senha é obrigatória" }),
    code: z.string().min(1, { message: "Código é obrigatório" }),
})

// ─── Tipos inferidos ──────────────────────────────────────────────────────────
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type MfaLoginVerifyInput = z.infer<typeof mfaLoginVerifySchema>
export type MfaSetupVerifyInput = z.infer<typeof mfaSetupVerifySchema>
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>
