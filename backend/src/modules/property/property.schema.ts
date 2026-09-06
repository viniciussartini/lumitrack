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

// Classe de faturamento Grupo B — REN 1.000/2021. Opcional no schema: a
// obrigatoriedade condicional por grupo tarifário (RF25/ADR-0019) é regra
// cruzada, validada em property.service.ts — mesmo padrão de RN01 do Medidor.
const billingClassSchema = z.enum(["B1", "B2", "B3"], {
    error: "Classe de faturamento deve ser B1, B2 ou B3",
})

// Grupo tarifário (ADR-0019) — define a tensão de fornecimento e o caminho de
// cálculo (monômio Grupo B × binômio Grupo A).
const tariffGroupSchema = z.enum(["GROUP_A", "GROUP_B"], {
    error: "Grupo tarifário deve ser GROUP_A ou GROUP_B",
})

// Subgrupo do Grupo A — REN 1.000/2021. B1/B2/B3 do Grupo B continuam em
// billingClass (ADR-0019).
const tariffSubgroupSchema = z.enum(["A1", "A2", "A3", "A3A", "A4", "AS"], {
    error: "Subgrupo deve ser A1, A2, A3, A3A, A4 ou AS",
})

// Modalidade tarifária do Grupo A — só Horária Verde tem cálculo implementado
// na Fase 19; Azul/Convencional Binômia chegam na Fase 20.
const tariffModalitySchema = z.enum(["CONVENTIONAL_BINOMIAL", "GREEN", "BLUE"], {
    error: "Modalidade deve ser CONVENTIONAL_BINOMIAL, GREEN ou BLUE",
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

    // default GROUP_B preserva o comportamento anterior à Fase 19.
    tariffGroup: tariffGroupSchema.default("GROUP_B"),

    // Sem default aqui: o default "B1" só se aplica quando o grupo é GROUP_B,
    // e essa ramificação é resolvida em property.service.ts.
    billingClass: billingClassSchema.optional(),

    tariffSubgroup: tariffSubgroupSchema.optional(),

    tariffModality: tariffModalitySchema.optional(),

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

    tariffGroup: tariffGroupSchema.optional(),

    billingClass: billingClassSchema.optional(),

    tariffSubgroup: tariffSubgroupSchema.optional(),

    tariffModality: tariffModalitySchema.optional(),

    publicLightingFeeBrl: publicLightingFeeBrlSchema.optional(),
})

// Tipos inferidos

export type CreatePropertyInput = z.infer<typeof createPropertySchema>
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>
