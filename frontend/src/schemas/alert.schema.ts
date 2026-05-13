import { z } from "zod"

/**
 * Helper: transforma string vazia em undefined.
 * Mesmo padrão usado em consumption.schema — <input> vazio entrega "" ao
 * RHF, mas campos opcionais esperam undefined.
 */
const emptyStringToUndefined = z
    .string()
    .optional()
    .transform((val) => (val === "" || val === undefined ? undefined : val))

/**
 * Schema do form de Alerta — usado em criação e edição.
 *
 * Espelha createAlertSchema do backend, com adaptações para o
 * <input type="number">:
 *
 *   - thresholdKwh: HTML input entrega string. Coercimos para number
 *     distinguindo "" (não informado) de 0 (informado mas inválido).
 *     NaN cai na validação z.number({ message }) com mensagem amigável;
 *     positive() rejeita ≤ 0. Mesmo padrão de kwhConsumed em consumption.
 *
 *   - message: opcional, max 500 chars. emptyStringToUndefined normaliza
 *     string vazia para undefined antes do schema string ser aplicado.
 *
 * Em UPDATE, ambos os campos são editáveis (não há campo "identificador"
 * imutável como em consumption, onde period+referenceDate definem o
 * registro). O backend valida thresholdKwh positive em ambos create e
 * update — então um único schema cobre os dois modos.
 */
export const alertFormSchema = z.object({
    /**
     * Coerção string→number igual ao consumption.kwhConsumed.
     * Sem essa preprocess, z.coerce.number() converteria "" para 0
     * silenciosamente (perderíamos a distinção "não informado" vs zero,
     * que é inválido neste domínio).
     */
    thresholdKwh: z
        .union([z.string(), z.number()])
        .transform((val) => {
            if (val === "" || val === undefined) return NaN
            if (typeof val === "number") return val
            const n = Number(val)
            return Number.isNaN(n) ? NaN : n
        })
        .pipe(
            z
                .number({ message: "Informe um número válido" })
                .positive("Limite deve ser maior que zero"),
        ),

    message: emptyStringToUndefined.pipe(
        z.string().max(500, "Máximo 500 caracteres").optional(),
    ),
})

/** Tipo de SAÍDA — o que onSubmit recebe (já transformado) */
export type AlertFormData = z.output<typeof alertFormSchema>

/** Tipo de ENTRADA — o que o form rastreia internamente (strings do HTML) */
export type AlertFormInput = z.input<typeof alertFormSchema>