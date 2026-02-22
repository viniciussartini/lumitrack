import { z } from "zod"

// Regex para validar formato de CPF e CNPJ.
// A validação matemática dos dígitos verificadores é feita no refinement abaixo.
const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/
const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/

// Validação matemática do CPF
// O CPF tem dois dígitos verificadores calculados a partir dos 9 primeiros.
// Sem essa validação, CPFs como "111.111.111-11" passariam no regex mas são inválidos.
function isValidCpf(cpf: string): boolean {
    const digits = cpf.replace(/\D/g, "")
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false

    const calc = (len: number) => {
        const sum = digits
        .slice(0, len)
        .split("")
        .reduce((acc, d, i) => acc + parseInt(d) * (len + 1 - i), 0)
        const rem = (sum * 10) % 11
        return rem === 10 || rem === 11 ? 0 : rem
    }

    return calc(9) === parseInt(digits[9]!) && calc(10) === parseInt(digits[10]!)
}

// Validação matemática do CNPJ
function isValidCnpj(cnpj: string): boolean {
    const digits = cnpj.replace(/\D/g, "")
    if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false

    const calc = (len: number) => {
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

// Schema base
const baseUserSchema = z.object({
    email: z.email({ message: "E-mail inválido" }),
    password: z
        .string()
        .min(8, { message: "A senha deve ter ao menos 8 caracteres" })
        .regex(/[A-Z]/, { message: "A senha deve conter ao menos uma letra maiúscula" })
        .regex(/[a-z]/, { message: "A senha deve conter ao menos uma letra minúscula" })
        .regex(/[0-9]/, { message: "A senha deve conter ao menos um número" }),
})

// Schema de pessoa física
const individualSchema = baseUserSchema.extend({
    userType: z.literal("INDIVIDUAL"),
    firstName: z.string().min(1, { message: "Nome é obrigatório" }),
    lastName: z.string().min(1, { message: "Sobrenome é obrigatório" }),
    cpf: z
        .string()
        .regex(cpfRegex, { message: "CPF deve estar no formato 000.000.000-00" })
        .refine(isValidCpf, { message: "CPF inválido" }),
    // Campos de PJ não se aplicam à PF
    companyName: z.undefined().optional(),
    cnpj: z.undefined().optional(),
    tradeName: z.undefined().optional(),
})

// Schema de pessoa jurídica
const companySchema = baseUserSchema.extend({
    userType: z.literal("COMPANY"),
    companyName: z.string().min(1, { message: "Razão social é obrigatória" }),
    cnpj: z
        .string()
        .regex(cnpjRegex, { message: "CNPJ deve estar no formato 00.000.000/0000-00" })
        .refine(isValidCnpj, { message: "CNPJ inválido" }),
    tradeName: z.string().optional(),
    // Campos de PF não se aplicam à PJ
    firstName: z.undefined().optional(),
    lastName: z.undefined().optional(),
    cpf: z.undefined().optional(),
})

// ─── Schema discriminado ──────────────────────────────────────────────────────
// O discriminatedUnion usa o campo `userType` para decidir qual schema aplicar.
// É mais eficiente e produz mensagens de erro mais claras do que um union simples,
// porque o Zod não precisa tentar todos os schemas — ele vai direto ao certo.
export const createUserSchema = z.discriminatedUnion("userType", [
    individualSchema,
    companySchema,
])

// ─── Schema de atualização ────────────────────────────────────────────────────
// Todos os campos são opcionais na atualização — o usuário pode atualizar
// apenas o que quiser. Omitimos `userType` porque não faz sentido mudar
// de pessoa física para jurídica após o cadastro.
export const updateUserSchema = z.object({
    email: z.email({ message: "E-mail inválido" }).optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    companyName: z.string().min(1).optional(),
    tradeName: z.string().optional(),
})

// ─── Tipos inferidos ──────────────────────────────────────────────────────────
// Inferimos os tipos TypeScript diretamente do schema Zod.
// Isso garante que o tipo e a validação nunca ficam dessincronizados —
// há uma única fonte da verdade.
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>