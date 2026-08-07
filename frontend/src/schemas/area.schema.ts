import { z } from "zod"

/**
 * Helper: transforma string vazia em undefined.
 *
 * Idêntico ao usado em property.schema. Ver justificativa lá: <input> vazio
 * entrega "" ao RHF, mas o schema do backend espera undefined nos campos
 * opcionais (z.string().min(1).optional() rejeita "").
 */
const emptyToUndefined = z
    .string()
    .optional()
    .transform((val) => (val === "" || val === undefined ? undefined : val))

/**
 * Schema do form de Área.
 *
 * Espelha createAreaSchema do backend:
 *   - name: string 1-200, obrigatório
 *   - description: string 1-1000, opcional
 *
 * Diferença em relação ao backend:
 *   - description aceita string vazia e converte pra undefined antes de
 *     validar (vide emptyToUndefined). O backend só vê undefined ou string
 *     com pelo menos 1 caractere.
 */
export const areaFormSchema = z.object({
    name: z
        .string()
        .min(1, "Nome é obrigatório")
        .max(200, "Nome muito longo (máx. 200 caracteres)"),

    description: emptyToUndefined.pipe(
        z.string().max(1000, "Descrição muito longa (máx. 1000 caracteres)").optional(),
    ),
})

/** Tipo de SAÍDA — o que onSubmit recebe (já transformado) */
export type AreaFormData = z.output<typeof areaFormSchema>

/** Tipo de ENTRADA — o que o form rastreia internamente (strings do HTML) */
export type AreaFormInput = z.input<typeof areaFormSchema>
