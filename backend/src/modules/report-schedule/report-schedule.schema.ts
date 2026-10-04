import { z } from "zod"
import { targetTypeSchema } from "@/modules/meter/meter.schema.js"
import { reportFormatSchema, reportTypeSchema } from "@/modules/report/report.schema.js"
import { paginationQuerySchema } from "@/shared/pagination.js"

export const reportFrequencySchema = z.enum([
    "DAILY",
    "WEEKLY",
    "MONTHLY",
    "QUARTERLY",
    "SEMIANNUAL",
    "ANNUAL",
])

// Tetos contra abuso: cada envio sai para endereços de terceiros, então nº de
// destinatários e de configurações por usuário limitam o volume de e-mail que
// uma conta consegue disparar.
export const MAX_RECIPIENTS = 10
export const MAX_SCHEDULES_PER_USER = 20
const MAX_EMAIL_LENGTH = 254

const recipientSchema = z
    .string()
    .trim()
    .toLowerCase()
    .max(MAX_EMAIL_LENGTH, { message: "E-mail muito longo" })
    .pipe(z.email({ message: "E-mail de destinatário inválido" }))

// Mesmo corpo na criação e na edição (PUT substitui a configuração inteira).
// O dia do envio depende da frequência: nenhum na diária, 1–7 (segunda a
// domingo) na semanal e 1–31 nas demais — mês mais curto envia no último dia.
export const reportScheduleBodySchema = z
    .object({
        targetType: targetTypeSchema,
        targetId: z.uuid({ message: "targetId inválido" }),
        type: reportTypeSchema,
        format: reportFormatSchema,
        frequency: reportFrequencySchema,
        sendDay: z.number({ error: "sendDay deve ser um número" }).int().nullable().optional(),
        recipients: z
            .array(recipientSchema)
            .min(1, { message: "Informe ao menos um destinatário" })
            .max(MAX_RECIPIENTS, { message: `No máximo ${MAX_RECIPIENTS} destinatários` }),
        active: z.boolean().default(true),
    })
    .superRefine((data, ctx) => {
        const day = data.sendDay ?? null
        if (data.frequency === "DAILY") {
            if (day !== null) {
                ctx.addIssue({
                    code: "custom",
                    path: ["sendDay"],
                    message: "A frequência diária não tem dia de envio",
                })
            }
        } else {
            const max = data.frequency === "WEEKLY" ? 7 : 31
            if (day === null || day < 1 || day > max) {
                ctx.addIssue({
                    code: "custom",
                    path: ["sendDay"],
                    message: `O dia do envio deve estar entre 1 e ${max}`,
                })
            }
        }

        if ((data.type === "MONTHLY" || data.type === "DEMAND") && data.frequency !== "MONTHLY") {
            ctx.addIssue({
                code: "custom",
                path: ["type"],
                message:
                    "Os relatórios mensal e de demanda só podem ser agendados com frequência mensal",
            })
        }
    })
    .transform((data) => ({
        ...data,
        sendDay: data.sendDay ?? null,
        // Mesmo endereço repetido só recebe uma cópia.
        recipients: [...new Set(data.recipients)],
    }))

export type ReportScheduleBody = z.infer<typeof reportScheduleBodySchema>

export const reportScheduleIdParamsSchema = z.object({
    id: z.uuid({ message: "id inválido" }),
})

export const listReportSchedulesQuerySchema = paginationQuerySchema
