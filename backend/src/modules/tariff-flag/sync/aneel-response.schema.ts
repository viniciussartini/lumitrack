import { z } from "zod"

// Valor decimal no formato BR usado pelos datasets da ANEEL ("18,85") —
// rejeita qualquer coisa fora desse formato em vez de tentar adivinhar
// (ex.: o valor malformado ",00" observado na investigação do ADR-0007
// não deve virar 0 silenciosamente).
const brDecimalStringSchema = z
    .string()
    .regex(/^\d+,\d{2}$/, { message: "Valor decimal fora do formato esperado (\"18,85\")" })
    .transform((value) => Number(value.replace(",", ".")))

const isoDateStringSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, { message: "Data fora do formato esperado (\"YYYY-MM-DD\")" })

// Recurso "Bandeira Tarifária - Acionamento" (resource_id
// 0591b8f6-fe54-437b-b72b-1aa2efd46e42) — só usamos `NomBandeiraAcionada`
// (qual bandeira esteve ativa em cada competência); o campo de valor deste
// recurso não é necessário, ver ADR-0007.
export const acionamentoRecordSchema = z.object({
    DatCompetencia: isoDateStringSchema,
    NomBandeiraAcionada: z.string().min(1),
})

// Recurso "Bandeira Tarifária - Adicional" (resource_id
// 5879ca80-b3bd-45b1-a135-d9b77c1d5b36) — valor em R$/MWh, convertido para
// R$/100kWh pelo adapter (÷ 10).
export const adicionalRecordSchema = z.object({
    DatVigencia: isoDateStringSchema,
    NomBandeiraAcionada: z.string().min(1),
    VlrAdicionalBandeiraRSMWh: brDecimalStringSchema,
})

// Envelope padrão da API DataStore do CKAN
// (`GET /api/3/action/datastore_search`) — mesma forma para qualquer
// resource_id, só o schema do record muda.
const ckanEnvelopeSchema = <RecordSchema extends z.ZodType>(recordSchema: RecordSchema) =>
    z.object({
        success: z.literal(true),
        result: z.object({
            records: z.array(recordSchema),
        }),
    })

export const acionamentoResponseSchema = ckanEnvelopeSchema(acionamentoRecordSchema)
export const adicionalResponseSchema = ckanEnvelopeSchema(adicionalRecordSchema)

export type AcionamentoRecord = z.infer<typeof acionamentoRecordSchema>
export type AdicionalRecord = z.infer<typeof adicionalRecordSchema>
