import { z } from "zod"

/**
 * Helper: transforma string vazia em undefined.
 * 
 * <input> vazio entrega "" ao RHF, mas campos opcionais esperam undefined.
 */
const emptyStringToUndefined = z
    .string()
    .optional()
    .transform((val) => (val === "" || val === undefined ? undefined : val))

/**
 * Schema do form de Registro de Consumo.
 *
 * Espelha createConsumptionSchema do backend, mas com diferenças importantes:
 *
 *   - referenceDate: aqui é STRING genérica (depende do period selecionado).
 *     A conversão para ISO datetime acontece no submit handler, antes de
 *     chamar a mutation. O HTML input garante o formato correto:
 *       HOURLY:  "2025-01-15T14:00" (input type="datetime-local")
 *       DAILY:   "2025-01-15"        (input type="date")
 *       MONTHLY: "2025-01"            (input type="month")
 *       ANNUAL:  "2025"               (input type="number" para ano)
 *
 *   - kwhConsumed: <input type="number"> entrega string ao RHF. Coercimos
 *     para number, distinguindo "" (não informado) de 0 (informado mas
 *     inválido). NaN cai na validação z.number({ message }) com mensagem
 *     amigável; positive() rejeita valores ≤ 0.
 *
 * Em UPDATE, apenas kwhConsumed e notes são editáveis (period e
 * referenceDate são identificadores). O form usa este schema completo —
 * o handler do EditDialog filtra os campos editáveis antes de chamar
 * a mutation. period/referenceDate ficam no form como readonly/disabled
 * para contexto.
 */
export const consumptionFormSchema = z.object({
    period: z.enum(["HOURLY", "DAILY", "MONTHLY", "ANNUAL"], {
        message: "Selecione um período",
    }),

    referenceDate: z.string().min(1, "Informe a data"),

    /**
     * Coerção string→number com fallback para NaN em casos inválidos —
     * NaN dispara z.number({ message }) com mensagem amigável.
     *
     * Sem essa preprocess, z.coerce.number() converteria "" para 0
     * silenciosamente (perderíamos a distinção "não informado" vs zero,
     * que é inválido neste domínio).
     */
    kwhConsumed: z
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
                .positive("Consumo deve ser maior que zero"),
        ),

    notes: emptyStringToUndefined.pipe(
        z.string().max(500, "Máximo 500 caracteres").optional(),
    ),
})

/** Tipo de SAÍDA — o que onSubmit recebe (já transformado) */
export type ConsumptionFormData = z.output<typeof consumptionFormSchema>

/** Tipo de ENTRADA — o que o form rastreia internamente (strings do HTML) */
export type ConsumptionFormInput = z.input<typeof consumptionFormSchema>