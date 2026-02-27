import { z } from "zod"

// Regex para validar formato de CNPJ
const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/

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

// Tensões de trabalho válidas no sistema elétrico brasileiro.
// Incluímos os valores mais comuns: residencial (127/220), industrial (380/440/660).
const VALID_VOLTAGES = [110, 127, 220, 380, 440, 660, 13800] as const

// Schema de criação

export const createDistributorSchema = z.object({
    name: z.string().min(1, { message: "Nome é obrigatório" }).max(200),

    cnpj: z
        .string()
        .regex(cnpjRegex, { message: "CNPJ deve estar no formato 00.000.000/0000-00" })
        .refine(isValidCnpj, { message: "CNPJ inválido" }),

    electricalSystem: z.enum(["MONOPHASIC", "BIPHASIC", "TRIPHASIC"], {
        error: "Sistema elétrico deve ser MONOPHASIC, BIPHASIC ou TRIPHASIC",
    }),

    workingVoltage: z
        .number({ error: "Tensão de trabalho deve ser um número" })
        .refine((v) => VALID_VOLTAGES.includes(v as typeof VALID_VOLTAGES[number]), {
            message: `Tensão deve ser uma das seguintes: ${VALID_VOLTAGES.join(", ")}`,
        }),

    // Preço por kWh — sempre obrigatório, deve ser positivo
    kwhPrice: z
        .number({ error: "Preço do kWh deve ser um número" })
        .positive({ message: "Preço do kWh deve ser positivo" }),

    // Alíquota de impostos em formato decimal (ex: 0.12 = 12%) — opcional
    taxRate: z
        .number()
        .min(0, { message: "Alíquota não pode ser negativa" })
        .max(1, { message: "Alíquota deve estar entre 0 e 1 (ex: 0.12 para 12%)" })
        .optional(),

    // Contribuição de Iluminação Pública em BRL — opcional
    publicLightingFee: z
        .number()
        .min(0, { message: "Contribuição de iluminação pública não pode ser negativa" })
        .optional(),
})

// Schema de atualização
// Todos os campos são opcionais na atualização.
// CNPJ não pode ser alterado após o cadastro — identificador imutável da distribuidora.
// (Assim como CPF/CNPJ do usuário não são alteráveis.)

export const updateDistributorSchema = z.object({
    name: z.string().min(1).max(200).optional(),

    electricalSystem: z
        .enum(["MONOPHASIC", "BIPHASIC", "TRIPHASIC"])
        .optional(),

    workingVoltage: z
        .number()
        .refine((v) => VALID_VOLTAGES.includes(v as typeof VALID_VOLTAGES[number]), {
            message: `Tensão deve ser uma das seguintes: ${VALID_VOLTAGES.join(", ")}`,
        })
        .optional(),

    kwhPrice: z
        .number()
        .positive({ message: "Preço do kWh deve ser positivo" })
        .optional(),

    taxRate: z
        .number()
        .min(0)
        .max(1, { message: "Alíquota deve estar entre 0 e 1" })
        .optional(),

    publicLightingFee: z
        .number()
        .min(0)
        .optional(),
})

// Tipos inferidos

export type CreateDistributorInput = z.infer<typeof createDistributorSchema>
export type UpdateDistributorInput = z.infer<typeof updateDistributorSchema>