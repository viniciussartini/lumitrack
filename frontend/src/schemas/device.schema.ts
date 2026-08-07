import { z } from "zod"

/**
 * Helper: transforma string vazia em undefined.
 * Idêntico ao usado em property.schema e area.schema.
 */
const emptyStringToUndefined = z
    .string()
    .optional()
    .transform((val) => (val === "" || val === undefined ? undefined : val))

/**
 * Helper: parseia string opcional para número.
 *
 * Por que não usar z.coerce.number().optional(): porque z.coerce.number("")
 * vira 0, não undefined — perdemos a distinção "não informado" vs "informado
 * como zero" (que é inválido).
 *
 * Aqui:
 *   - "" / undefined → undefined (campo não preenchido, válido para opcional)
 *   - string que não parseia → NaN, que falha em z.number() depois
 *   - string que parseia → number
 */
const optionalStringNumber = z.union([z.string(), z.number(), z.undefined()]).transform((val) => {
    if (val === undefined || val === "") return undefined
    if (typeof val === "number") return val
    const n = Number(val)
    return Number.isNaN(n) ? val : n
})

/**
 * Schema do form de Dispositivo.
 *
 * Espelha createDeviceSchema do backend:
 *   - name: string 1-200, obrigatório
 *   - brand: string max 100, opcional
 *   - model: string max 100, opcional
 *   - powerWatts: number positivo, opcional
 *
 * Diferenças em relação ao schema do backend:
 *   - Aceita string vazia em campos opcionais (transformada em undefined)
 *   - powerWatts vem do <input type="number"> como string e precisa ser
 *     coerced — usamos optionalStringNumber pra preservar a distinção
 *     "" vs "0" (este último é inválido).
 */
export const deviceFormSchema = z.object({
    name: z
        .string()
        .min(1, "Nome é obrigatório")
        .max(200, "Nome muito longo (máx. 200 caracteres)"),

    brand: emptyStringToUndefined.pipe(
        z.string().max(100, "Marca muito longa (máx. 100 caracteres)").optional(),
    ),

    model: emptyStringToUndefined.pipe(
        z.string().max(100, "Modelo muito longo (máx. 100 caracteres)").optional(),
    ),

    powerWatts: optionalStringNumber.pipe(
        z
            .number({ error: "Potência deve ser um número" })
            .positive("Potência deve ser maior que zero")
            .optional(),
    ),
})

/** Tipo de SAÍDA — o que onSubmit recebe (já transformado) */
export type DeviceFormData = z.output<typeof deviceFormSchema>

/** Tipo de ENTRADA — o que o form rastreia internamente (strings do HTML) */
export type DeviceFormInput = z.input<typeof deviceFormSchema>
