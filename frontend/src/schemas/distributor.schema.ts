import { z } from "zod"
import { VALID_VOLTAGES } from "@/types/distributor.types"

// Validação matemática de CNPJ (idêntica à do backend e register.schema.ts)

const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/

const isValidCnpj = (cnpj: string): boolean => {
    const digits = cnpj.replace(/\D/g, "")
    if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false

    const calc = (len: number): number => {
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

/**
 *  Helpers para parse de inputs numéricos
 * 
 * z.coerce.number() converte string→number automaticamente (via Number()).
 * Para campos opcionais, encadeamos .optional() e usamos transform pra
 * tratar string vazia como undefined (o que o <input type="number"> entrega
 * quando está vazio).
 */

/** Campo numérico opcional — string vazia ou undefined → undefined */
const optionalNumber = z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
        if (val === "" || val === undefined || val === null) return undefined
        const parsed = Number(val)
        return Number.isNaN(parsed) ? undefined : parsed
    })
    .pipe(z.number().optional())

/** Campo numérico obrigatório com mensagem customizada */
const requiredNumber = (message: string) =>
    z
        .union([z.string(), z.number()])
        .transform((val) => {
            if (val === "" || val === undefined || val === null) return NaN
            return Number(val)
        })
        .pipe(z.number({ message }))

/**
 * Schema do form
 * 
 * IMPORTANTE — diferenças em relação ao backend:
 *   - taxRate aqui é PERCENTUAL (0–100), backend espera DECIMAL (0–1).
 *     Conversão acontece no onSubmit da página (divide por 100).
 *   - workingVoltage e kwhPrice usam o helper requiredNumber porque
 *     <input type="number"> entrega string ao RHF.
 *   - cnpj é validado mas pode estar ausente (em modo edição é desabilitado
 *     e o valor inicial vem do backend).
 */

export const distributorFormSchema = z.object({
    name: z
        .string()
        .min(1, "Nome é obrigatório")
        .max(200, "Nome muito longo"),

    cnpj: z
        .string()
        .min(1, "CNPJ é obrigatório")
        .regex(cnpjRegex, "CNPJ deve estar no formato 00.000.000/0000-00")
        .refine(isValidCnpj, "CNPJ inválido"),

    electricalSystem: z.enum(["MONOPHASIC", "BIPHASIC", "TRIPHASIC"], {
        error: "Selecione o sistema elétrico",
    }),

    workingVoltage: requiredNumber("Selecione a tensão de trabalho").refine(
        (v) => VALID_VOLTAGES.includes(v as (typeof VALID_VOLTAGES)[number]),
        `Tensão deve ser uma das: ${VALID_VOLTAGES.join(", ")}`,
    ),

    kwhPrice: requiredNumber("Preço do kWh é obrigatório").refine(
        (v) => v > 0,
        "Preço do kWh deve ser positivo",
    ),

    /** Percentual 0–100 (0 = 0%, 100 = 100%) */
    taxRate: optionalNumber.refine(
        (v) => v === undefined || (v >= 0 && v <= 100),
        "Alíquota deve estar entre 0 e 100",
    ),

    publicLightingFee: optionalNumber.refine(
        (v) => v === undefined || v >= 0,
        "Contribuição não pode ser negativa",
    ),
})

/** Tipo de SAÍDA — o que onSubmit recebe (números já convertidos) */
export type DistributorFormData = z.output<typeof distributorFormSchema>

/** Tipo de ENTRADA — o que o form rastreia internamente (strings do HTML) */
export type DistributorFormInput = z.input<typeof distributorFormSchema>