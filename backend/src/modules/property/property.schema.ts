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
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
    "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

// Schema de criação

export const createPropertySchema = z.object({
    // distributorId é obrigatório na criação — regra de negócio do projeto
    distributorId: z.uuid({ message: "ID da distribuidora inválido" }),

    name: z.string().min(1, { message: "Nome é obrigatório" }).max(200),

    // Campos de endereço são opcionais
    address: z.string().min(1).max(500).optional(),

    city: z.string().min(1).max(100).optional(),

    state: z
        .enum(VALID_UFS, { error: `Estado deve ser uma das siglas UF válidas` })
        .optional(),

    zipCode: z
        .string()
        .regex(cepRegex, { message: "CEP deve estar no formato 00000-000" })
        .refine(isValidCep, { message: "CEP inválido" })
        .optional(),
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
})

// Tipos inferidos

export type CreatePropertyInput = z.infer<typeof createPropertySchema>
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>