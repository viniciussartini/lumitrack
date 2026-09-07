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
 * Campo numérico opcional (CIP) — mesma técnica do `distributor.schema.ts`
 * antigo: `<input type="number">` entrega string ao RHF; string vazia vira
 * undefined antes de qualquer validação numérica.
 */
const optionalNonNegativeNumber = z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
        if (val === "" || val === undefined || val === null) return undefined
        const parsed = Number(val)
        return Number.isNaN(parsed) ? undefined : parsed
    })
    .pipe(z.number().min(0, "Não pode ser negativo").optional())

/**
 * Demanda contratada (kW, Grupo A) — mesma técnica de `optionalNonNegativeNumber`,
 * mas exige > 0 (uma UC não tem demanda contratada zero).
 */
const optionalPositiveNumber = z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
        if (val === "" || val === undefined || val === null) return undefined
        const parsed = Number(val)
        return Number.isNaN(parsed) ? undefined : parsed
    })
    .pipe(z.number().positive("Deve ser maior que zero").optional())

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
 *   - `electricalSystem`/`billingClass`/`publicLightingFeeBrl` pertencem à
 *     propriedade, não à distribuidora.
 *
 * Regra cruzada de grupo tarifário (espelha
 * `PropertyService.resolveTariffGroupFields` do backend): Grupo A exige
 * subgrupo + modalidade + demanda contratada e não aceita `billingClass`;
 * Grupo B exige `billingClass` (default B1) e não aceita os 3 campos do
 * Grupo A. O schema sozinho (campos individualmente opcionais) não expressa
 * essa obrigatoriedade condicional — por isso o `.superRefine` abaixo, com
 * as mesmas mensagens do backend.
 */
export const propertyFormSchema = z
    .object({
        distributorId: z.string().min(1, { message: "Selecione uma distribuidora" }),

        name: z.string().min(1, "Nome é obrigatório").max(200, "Nome muito longo"),

        address: emptyToUndefined.pipe(z.string().max(500, "Endereço muito longo").optional()),

        city: emptyToUndefined.pipe(z.string().max(100, "Cidade muito longa").optional()),

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

        electricalSystem: z.enum(["MONOPHASIC", "BIPHASIC", "TRIPHASIC"], {
            message: "Selecione o sistema elétrico",
        }),

        tariffGroup: z.enum(["GROUP_A", "GROUP_B"]).default("GROUP_B"),

        billingClass: z.enum(["B1", "B2", "B3"]).optional(),

        // Só GREEN tem cálculo de conta implementado no backend — Azul/
        // Convencional ficam pra Fase 20 (ver TARIFF_MODALITY_LABELS).
        // emptyToUndefined: o placeholder do <select> ("Selecione") tem
        // value="" — sem essa conversão, "" falha o enum como valor inválido
        // em vez de cair no "obrigatório" do superRefine abaixo.
        tariffSubgroup: emptyToUndefined.pipe(
            z.enum(["A1", "A2", "A3", "A3A", "A4", "AS"]).optional(),
        ),

        tariffModality: emptyToUndefined.pipe(
            z.enum(["CONVENTIONAL_BINOMIAL", "GREEN", "BLUE"]).optional(),
        ),

        contractedDemandKw: optionalPositiveNumber,

        publicLightingFeeBrl: optionalNonNegativeNumber,
    })
    .superRefine((data, ctx) => {
        if (data.tariffGroup === "GROUP_A") {
            if (!data.tariffSubgroup) {
                ctx.addIssue({
                    code: "custom",
                    path: ["tariffSubgroup"],
                    message: "Subgrupo é obrigatório para propriedades do Grupo A",
                })
            }
            if (!data.tariffModality) {
                ctx.addIssue({
                    code: "custom",
                    path: ["tariffModality"],
                    message: "Modalidade tarifária é obrigatória para propriedades do Grupo A",
                })
            }
            if (data.contractedDemandKw === undefined) {
                ctx.addIssue({
                    code: "custom",
                    path: ["contractedDemandKw"],
                    message: "Demanda contratada é obrigatória para propriedades do Grupo A",
                })
            }
            if (data.billingClass) {
                ctx.addIssue({
                    code: "custom",
                    path: ["billingClass"],
                    message: "Classe de faturamento não se aplica a propriedades do Grupo A",
                })
            }
            return
        }

        if (data.tariffSubgroup) {
            ctx.addIssue({
                code: "custom",
                path: ["tariffSubgroup"],
                message: "Subgrupo só se aplica a propriedades do Grupo A",
            })
        }
        if (data.tariffModality) {
            ctx.addIssue({
                code: "custom",
                path: ["tariffModality"],
                message: "Modalidade tarifária só se aplica a propriedades do Grupo A",
            })
        }
        if (data.contractedDemandKw !== undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["contractedDemandKw"],
                message: "Demanda contratada só se aplica a propriedades do Grupo A",
            })
        }
    })
    .transform((data) => ({
        ...data,
        // Default B1 só se aplica ao Grupo B — mesma regra do backend
        // (resolveTariffGroupFields), aplicada aqui pós-refine pra não
        // conflitar com a validação "billingClass não se aplica ao Grupo A".
        billingClass: data.tariffGroup === "GROUP_B" ? (data.billingClass ?? "B1") : undefined,
    }))

/** Tipo de SAÍDA — o que onSubmit recebe (já transformado) */
export type PropertyFormData = z.output<typeof propertyFormSchema>

/** Tipo de ENTRADA — o que o form rastreia internamente (strings do HTML) */
export type PropertyFormInput = z.input<typeof propertyFormSchema>
