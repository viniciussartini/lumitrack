import { z } from "zod"

/**
 * Campo numérico obrigatório — <input type="number"> entrega string ao RHF;
 * coagimos para number distinguindo "" (não informado) de 0 (inválido aqui,
 * ambos os campos exigem > 0 ou faixa específica).
 */
const requiredNumber = (message: string) =>
    z
        .union([z.string(), z.number()])
        .transform((val) => {
            if (val === "" || val === undefined) return NaN
            return Number(val)
        })
        .pipe(z.number({ message }))

/**
 * Schema do form de Alerta (Fase 5 — faixa de potência, substitui o antigo
 * thresholdKwh). Espelha `createAlertSchema`/`updateAlertSchema` do backend.
 *
 * `meterId` é imutável após a criação — o form só o exibe (Select) em modo
 * criação; em edição, viaja como `<input type="hidden">` com o valor
 * original, garantindo que participe da validação sem exigir escolha do
 * usuário.
 */
export const alertFormSchema = z.object({
    name: z.string().min(1, "Nome é obrigatório").max(200, "Nome muito longo"),

    meterId: z.string().min(1, "Selecione um medidor"),

    referencePowerKw: requiredNumber("Informe um número válido").pipe(
        z.number().positive("Deve ser maior que zero"),
    ),

    tolerancePercent: requiredNumber("Informe um número válido").pipe(
        z
            .number()
            .min(0, "Não pode ser negativo")
            .max(100, "Não pode ultrapassar 100"),
    ),

    enabled: z.boolean().default(true),
})

/** Tipo de SAÍDA — o que onSubmit recebe (já transformado) */
export type AlertFormData = z.output<typeof alertFormSchema>

/** Tipo de ENTRADA — o que o form rastreia internamente (strings do HTML) */
export type AlertFormInput = z.input<typeof alertFormSchema>
