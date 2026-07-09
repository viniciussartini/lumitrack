import { z } from "zod"

// Validação matemática de CPF/CNPJ
// Lógica idêntica à do backend (user.schema.ts)
// replicada para dar feedback imediato sem precisar bater no servidor para erros óbvios.

const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/
const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/

const isValidCpf = (cpf: string): boolean => {
    const digits = cpf.replace(/\D/g, "")
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false

    const calc = (len: number): number => {
        let sum = 0
        for (let i = 0; i < len; i++) {
            sum += parseInt(digits[i]!) * (len + 1 - i)
        }
        const rem = (sum * 10) % 11
        return rem === 10 ? 0 : rem
    }

    return calc(9) === parseInt(digits[9]!) && calc(10) === parseInt(digits[10]!)
}

const isValidCnpj = (cnpj: string): boolean => {
    const digits = cnpj.replace(/\D/g, "")
    if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false

    const calc = (len: number): number => {
        let sum = 0
        let pos = len - 7
        for (let i = len; i >= 1; i--) {
            sum += parseInt(digits[len - i]!) * pos--
            if (pos < 2) pos = 9
        }
        const rem = sum % 11
        return rem < 2 ? 0 : 11 - rem
    }

    return calc(12) === parseInt(digits[12]!) && calc(13) === parseInt(digits[13]!)
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const passwordSchema = z
    .string()
    .min(8, { message: "A senha deve ter ao menos 8 caracteres" })
    .regex(/[A-Z]/, { message: "A senha deve conter ao menos uma letra maiúscula" })
    .regex(/[a-z]/, { message: "A senha deve conter ao menos uma letra minúscula" })
    .regex(/[0-9]/, { message: "A senha deve conter ao menos um número" })
    .regex(/[^A-Za-z0-9]/, { message: "A senha deve conter ao menos um caractere especial" })

const baseSchema = z.object({
    email: z
        .string()
        .min(1, "E-mail é obrigatório")
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "E-mail inválido"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a senha"),
    // Aceite explícito da Política de Privacidade e dos Termos de Uso (LGPD Art. 7º/8º).
    // Tipado como boolean (não literal(true)) para o checkbox poder iniciar
    // desmarcado (false) — o refine garante que só "true" passa a validação.
    acceptedTerms: z.boolean().refine((val) => val === true, {
        message: "É necessário aceitar a Política de Privacidade e os Termos de Uso",
    }),
})

const individualSchema = baseSchema.extend({
    userType: z.literal("INDIVIDUAL"),
    firstName: z.string().min(1, "Nome é obrigatório"),
    lastName: z.string().min(1, "Sobrenome é obrigatório"),
    cpf: z
        .string()
        .min(1, "CPF é obrigatório")
        .regex(cpfRegex, "CPF deve estar no formato 000.000.000-00")
        .refine(isValidCpf, "CPF inválido"),
})

const companySchema = baseSchema.extend({
    userType: z.literal("COMPANY"),
    companyName: z.string().min(1, "Razão social é obrigatória"),
    cnpj: z
        .string()
        .min(1, "CNPJ é obrigatório")
        .regex(cnpjRegex, "CNPJ deve estar no formato 00.000.000/0000-00")
        .refine(isValidCnpj, "CNPJ inválido"),
    tradeName: z.string().optional(),
})

/**
 * Schema final: discriminated union por userType + refine cruzado para
 * confirmação de senha. O refine fica DEPOIS do union para que o erro
 * apareça no campo confirmPassword independente do userType.
 */
export const registerSchema = z
    .discriminatedUnion("userType", [individualSchema, companySchema])
    .refine((data) => data.password === data.confirmPassword, {
        message: "As senhas não coincidem",
        path: ["confirmPassword"],
    })

export type RegisterFormData = z.infer<typeof registerSchema>