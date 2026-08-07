import { z } from "zod"

// Validação de CEP
//   1. Formato 00000-000 (regex)
//   2. Rejeitar sequências obviamente inválidas (00000-000, 11111-111, etc.)

const cepRegex = /^\d{5}-\d{3}$/

function isValidCep(cep: string): boolean {
    const digits = cep.replace("-", "")
    // Rejeita sequências de dígito único repetido: 00000000, 11111111, ..., 99999999
    return !/^(\d)\1+$/.test(digits)
}

// Validação de UF
// Lista completa das 26 estados + Distrito Federal.

const VALID_UFS = [
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
] as const

// Sistema elétrico da unidade consumidora — define o piso de disponibilidade
// (30/50/100 kWh) aplicado na tarifação mensal (ver TariffService).
const electricalSystemSchema = z.enum(["MONOPHASIC", "BIPHASIC", "TRIPHASIC"], {
    error: "Sistema elétrico deve ser MONOPHASIC, BIPHASIC ou TRIPHASIC",
})

// Classe de faturamento Grupo B — REN 1.000/2021.
const billingClassSchema = z.enum(["B1", "B2", "B3"], {
    error: "Classe de faturamento deve ser B1, B2 ou B3",
})

// CIP/COSIP municipal — valor fixo em BRL, opcional (nem todo município cobra).
const publicLightingFeeBrlSchema = z
    .number()
    .min(0, { message: "Contribuição de iluminação pública não pode ser negativa" })

// Schema de criação

export const createPropertySchema = z.object({
    // distributorId é obrigatório na criação — regra de negócio do projeto
    distributorId: z.uuid({ message: "ID da distribuidora inválido" }),

    name: z.string().min(1, { message: "Nome é obrigatório" }).max(200),

    // Campos de endereço são opcionais
    address: z.string().min(1).max(500).optional(),

    city: z.string().min(1).max(100).optional(),

    state: z.enum(VALID_UFS, { error: `Estado deve ser uma das siglas UF válidas` }).optional(),

    zipCode: z
        .string()
        .regex(cepRegex, { message: "CEP deve estar no formato 00000-000" })
        .refine(isValidCep, { message: "CEP inválido" })
        .optional(),

    electricalSystem: electricalSystemSchema,

    // default residencial B1 — mesmo default do banco.
    billingClass: billingClassSchema.default("B1"),

    publicLightingFeeBrl: publicLightingFeeBrlSchema.optional(),
})

// Schema de atualização
// distributorId pode ser alterado (troca de distribuidora permitida).

export const updatePropertySchema = z.object({
    distributorId: z.uuid({ message: "ID da distribuidora inválido" }).optional(),

    name: z.string().min(1).max(200).optional(),

    address: z.string().min(1).max(500).optional(),

    city: z.string().min(1).max(100).optional(),

    state: z.enum(VALID_UFS).optional(),

    zipCode: z
        .string()
        .regex(cepRegex, { message: "CEP deve estar no formato 00000-000" })
        .refine(isValidCep, { message: "CEP inválido" })
        .optional(),

    electricalSystem: electricalSystemSchema.optional(),

    billingClass: billingClassSchema.optional(),

    publicLightingFeeBrl: publicLightingFeeBrlSchema.optional(),
})

// Tipos inferidos

export type CreatePropertyInput = z.infer<typeof createPropertySchema>
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>
