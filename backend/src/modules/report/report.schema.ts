import { z } from "zod"
import type { ConsumptionResponse } from "@/modules/consumption/consumption.repository.js"

// ─── Period ───────────────────────────────────────────────────────────────────

export const reportPeriodSchema = z.enum(["DAILY", "MONTHLY", "ANNUAL"])

// ─── Target ───────────────────────────────────────────────────────────────────
// Query params chegam sempre como string — mesmo um UUID vem como texto puro.
// Por isso usamos z.string() aqui em vez de z.uuid(), e o service valida
// a existência/posse do recurso no banco separadamente.
//
// A regra de negócio por target:
//   PROPERTY → sem targetId (o propertyId já vem da URL)
//   AREA     → targetId obrigatório (areaId)
//   DEVICE   → targetId obrigatório (deviceId) + targetAreaId obrigatório (para validar hierarquia)
//
// Usamos discriminatedUnion pelo campo `target` para que o Zod já saiba
// quais campos extras exigir sem precisar validar todos os branches.

const propertyTargetSchema = z.object({
    target:       z.literal("PROPERTY"),
    targetId:     z.undefined().optional(),
    targetAreaId: z.undefined().optional(),
})

const areaTargetSchema = z.object({
    target:       z.literal("AREA"),
    targetId:     z.string().uuid({ message: "targetId deve ser um UUID válido" }),
    targetAreaId: z.undefined().optional(),
})

const deviceTargetSchema = z.object({
    target:       z.literal("DEVICE"),
    targetId:     z.string().uuid({ message: "targetId deve ser um UUID válido" }),
    targetAreaId: z.string().uuid({ message: "targetAreaId deve ser um UUID válido" }),
})

// ─── Query params completos ───────────────────────────────────────────────────
// O .and() combina os campos comuns (period, dateFrom, dateTo) com o
// discriminated union do target — o mesmo padrão usado em simulation.schema.ts.
//
// dateFrom e dateTo são strings ISO 8601 (ex: "2025-01-01") que o Zod
// converte para Date via z.coerce.date(). O pipe garante que strings
// inválidas como "nao-e-data" sejam rejeitadas com mensagem clara.

const commonQuerySchema = z.object({
    period: reportPeriodSchema,

    dateFrom: z
        .string()
        .pipe(z.coerce.date())
        .optional(),

    dateTo: z
        .string()
        .pipe(z.coerce.date())
        .optional(),
})

export const reportQuerySchema = commonQuerySchema.and(
    z.discriminatedUnion("target", [
        propertyTargetSchema,
        areaTargetSchema,
        deviceTargetSchema,
    ]),
)

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type ReportPeriod = z.infer<typeof reportPeriodSchema>
export type ReportQuery  = z.infer<typeof reportQuerySchema>

// ─── Trend ───────────────────────────────────────────────────────────────────
// Representa a direção do consumo ao longo do período analisado.
// INSUFFICIENT_DATA é retornado quando há menos de 2 registros —
// não é possível calcular tendência com um único ponto de dado,
// assim como não se pode medir velocidade com apenas uma posição.

export type ReportTrend = "INCREASING" | "DECREASING" | "STABLE" | "INSUFFICIENT_DATA"

// ─── Tipos do output ──────────────────────────────────────────────────────────

export type ReportSummary = {
    totalKwh:        number
    totalCostBrl:    number
    recordCount:     number
    avgKwhPerRecord: number
    trend:           ReportTrend
}

export type ReportTarget =
    | { type: "PROPERTY"; propertyId: string }
    | { type: "AREA";     propertyId: string; areaId: string }
    | { type: "DEVICE";   propertyId: string; areaId: string; deviceId: string }

export type ReportResult = {
    generatedAt: Date
    period:      ReportPeriod
    target:      ReportTarget
    dateRange:   { from: Date; to: Date } | null
    summary:     ReportSummary
    records:     ConsumptionResponse[]
}