import { z } from "zod"
import { targetTypeSchema } from "@/modules/meter/meter.schema.js"
import { fromSaoPauloLocal } from "@/shared/time/localTime.js"

export const reportFormatSchema = z.enum(["PDF", "CSV"])
export type ReportFormat = z.infer<typeof reportFormatSchema>

// Tipos com gerador implementado. O enum do banco (`ReportType`) é maior de
// propósito — os demais tipos entram aqui quando ganharem gerador; até lá um
// pedido para eles é rejeitado na borda, falhando fechado.
export const reportTypeSchema = z.enum(["MONTHLY", "CONSUMPTION"])
export type ReportType = z.infer<typeof reportTypeSchema>

const DAY_MS = 24 * 60 * 60 * 1000

// Teto do período — mesma razão do teto das comparações de período: sem ele,
// `from`/`to` bastariam para pedir uma agregação arbitrariamente grande.
export const MAX_REPORT_PERIOD_DAYS = 92

const baseFields = {
    targetType: targetTypeSchema,
    targetId: z.string().uuid({ message: "targetId inválido" }),
    format: reportFormatSchema,
}

// Relatório de consumo: período livre. `to` é exclusivo, como nas demais
// consultas por intervalo do projeto.
const consumptionReportSchema = z
    .object({
        ...baseFields,
        type: z.literal("CONSUMPTION"),
        from: z.coerce.date({ error: "from deve ser uma data válida" }),
        to: z.coerce.date({ error: "to deve ser uma data válida" }),
    })
    .refine((data) => data.to > data.from, {
        message: "to deve ser depois de from",
        path: ["to"],
    })
    .refine((data) => data.to.getTime() - data.from.getTime() <= MAX_REPORT_PERIOD_DAYS * DAY_MS, {
        message: `O período não pode exceder ${MAX_REPORT_PERIOD_DAYS} dias`,
        path: ["to"],
    })

// Relatório mensal: sempre um mês-calendário inteiro, escolhido por "AAAA-MM".
// O intervalo é derivado no servidor, para o cliente não poder pedir um
// "mensal" de meio mês.
const monthlyReportSchema = z.object({
    ...baseFields,
    type: z.literal("MONTHLY"),
    month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month deve estar no formato AAAA-MM" }),
})

export const createReportSchema = z.discriminatedUnion("type", [
    consumptionReportSchema,
    monthlyReportSchema,
])

export type CreateReportInput = z.infer<typeof createReportSchema>

export const reportIdParamsSchema = z.object({
    id: z.string().uuid({ message: "id inválido" }),
})

export interface ReportPeriod {
    from: Date
    to: Date
}

/**
 * Início (inclusive) e fim (exclusivo) do mês-calendário "AAAA-MM" em hora de
 * São Paulo, como instantes UTC — mesma convenção dos baldes de consumo.
 *
 * @param month - Mês no formato "AAAA-MM", já validado pelo schema.
 */
export function monthToPeriod(month: string): ReportPeriod {
    const [year, monthNumber] = month.split("-").map(Number) as [number, number]
    return {
        from: fromSaoPauloLocal(new Date(Date.UTC(year, monthNumber - 1, 1))),
        to: fromSaoPauloLocal(new Date(Date.UTC(year, monthNumber, 1))),
    }
}

/** Período efetivo de um pedido de relatório, seja de mês inteiro ou livre. */
export function resolveReportPeriod(input: CreateReportInput): ReportPeriod {
    return input.type === "MONTHLY"
        ? monthToPeriod(input.month)
        : { from: input.from, to: input.to }
}
