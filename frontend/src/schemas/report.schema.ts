import { z } from "zod"

/**
 * Schema do filtro de Relatório.
 *
 * Diferenças importantes em relação a outros schemas do projeto:
 *
 *  - Não é form de criação/edição. É filtro read-only que alimenta a URL
 *    (query string) e a query do TanStack. Mesmo assim Zod é útil porque:
 *    a) sanitiza strings vindas da URL (`?period=XYZ` inválido vira erro),
 *    b) descreve o contrato de forma testável,
 *    c) reaproveita o emptyStringToUndefined que já é convenção do projeto.
 *
 *  - `period` é obrigatório. O filtro tem default (MONTHLY na página),
 *    mas o schema NÃO aplica esse default — quem decide o default é a
 *    página, porque ele pode variar por contexto (futuramente, DEVICE
 *    poderia ter default DAILY, por exemplo). Schema fica neutro.
 *
 *  - `dateFrom` e `dateTo` são opcionais. Vazio → "todos os registros".
 *    Validação de range (from <= to) é feita aqui via `.refine()`.
 */

const emptyStringToUndefined = z
    .string()
    .optional()
    .transform((val) => (val === "" || val === undefined ? undefined : val))

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

/**
 * Formato YYYY-MM-DD que `<input type="date">` produz nativamente.
 *
 * Por que regex em vez de z.iso.date()?
 *   z.iso.date() existe mas só foi adicionado em versões recentes do Zod.
 *   Regex é portável e o contrato é estrito: backend aceita o formato
 *   exato `YYYY-MM-DD` via z.iso.date() | z.iso.datetime(), e o input
 *   nativo do browser nunca produz algo diferente disso.
 */
const dateString = emptyStringToUndefined.pipe(
    z
        .string()
        .regex(isoDateRegex, "Data deve estar no formato AAAA-MM-DD")
        .optional(),
)

export const reportFiltersSchema = z
    .object({
        period: z.enum(["DAILY", "MONTHLY", "ANNUAL"], {
            message: "Selecione um período válido",
        }),
        dateFrom: dateString,
        dateTo: dateString,
    })
    .refine(
        (data) => {
            if (!data.dateFrom || !data.dateTo) return true
            return data.dateFrom <= data.dateTo
        },
        {
            // Path aponta pro campo "errado" semanticamente — o usuário pensa
            // que escolheu o "fim" antes do "início", então o erro fica
            // próximo do dateTo. Mesma decisão de UX que outros forms.
            path: ["dateTo"],
            message: "Data final deve ser maior ou igual à inicial",
        },
    )

/** Tipo de saída — o que `parse()` retorna depois das transformações. */
export type ReportFiltersData = z.output<typeof reportFiltersSchema>