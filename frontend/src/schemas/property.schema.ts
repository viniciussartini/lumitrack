import { z } from "zod"
import { VALID_UFS } from "@/types/property.types"

// Validação de CEP — idêntica à do backend (property.schema.ts)
//   1. Formato 00000-000 (regex)
//   2. Rejeitar sequências obviamente inválidas (00000-000, 11111-111, etc.)

const cepRegex = /^\d{5}-\d{3}$/

const isValidCep = (cep: string): boolean => {
    const digits = cep.replace("-", "")
    // Rejeita sequências de dígito único repetido: 00000000, 11111111, ..., 99999999
    return !/^(\d)\1+$/.test(digits)
}

/**
 * Helper: transforma string vazia em undefined.
 *
 * <input> vazio entrega "" ao RHF, o schema espera undefined nos
 * campos opcionais. Sem esse transform, "" passaria adiante e quebraria
 * validações como `z.string().max(N).optional()` (que aceita undefined,
 * não string vazia tratada como ausente) — ou, mandaria string vazia
 * ao backend, que rejeita por causa do `min(1)`.
 *
 * O .pipe() depois garante que validações posteriores (max, regex, refine)
 * só rodem quando há valor real.
 */
const emptyToUndefined = z
    .string()
    .optional()
    .transform((val) => (val === "" || val === undefined ? undefined : val))

/**
 * Schema do form de Property.
 *
 * Diferenças em relação ao backend:
 *   - distributorId aqui é string com min(1) — a mensagem "Selecione uma
 *     distribuidora" é mais útil pro usuário do que "uuid inválido".
 *     A validação de UUID real é feita pelo backend (quem manipula o select
 *     só consegue escolher ids legítimos das distribuidoras carregadas).
 *   - Campos opcionais aceitam string vazia e convertem pra undefined antes
 *     de validar (vide emptyToUndefined acima).
 */
export const propertyFormSchema = z.object({
    distributorId: z
        .string()
        .min(1, { message: "Selecione uma distribuidora" }),

    name: z
        .string()
        .min(1, "Nome é obrigatório")
        .max(200, "Nome muito longo"),

    address: emptyToUndefined.pipe(
        z.string().max(500, "Endereço muito longo").optional(),
    ),

    city: emptyToUndefined.pipe(
        z.string().max(100, "Cidade muito longa").optional(),
    ),

    state: emptyToUndefined.pipe(
        z.enum(VALID_UFS, { message: "Selecione um estado válido" }).optional(),
    ),

    zipCode: emptyToUndefined.pipe(
        z
            .string()
            .regex(cepRegex, "CEP deve estar no formato 00000-000")
            .refine(isValidCep, "CEP inválido")
            .optional(),
    ),
})

/** Tipo de SAÍDA — o que onSubmit recebe (já transformado) */
export type PropertyFormData = z.output<typeof propertyFormSchema>

/** Tipo de ENTRADA — o que o form rastreia internamente (strings do HTML) */
export type PropertyFormInput = z.input<typeof propertyFormSchema>