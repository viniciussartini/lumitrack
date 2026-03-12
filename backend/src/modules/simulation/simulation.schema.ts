import { z } from "zod"

// ─── Period ───────────────────────────────────────────────────────────────────

export const simulationPeriodSchema = z.enum(["DAILY", "MONTHLY", "ANNUAL"])

// ─── Target ───────────────────────────────────────────────────────────────────
// Discriminated union pelo campo `type`.
// PROPERTY não precisa de id extra — usa o propertyId da URL.
// AREA exige areaId.
// DEVICE exige deviceId + areaId (para validar a cadeia de posse).

const propertyTargetSchema = z.object({
    type: z.literal("PROPERTY"),
})

const areaTargetSchema = z.object({
    type:   z.literal("AREA"),
    areaId: z.uuid({ message: "areaId inválido" }),
})

const deviceTargetSchema = z.object({
    type:     z.literal("DEVICE"),
    deviceId: z.uuid({ message: "deviceId inválido" }),
    areaId:   z.uuid({ message: "areaId inválido" }),
})

export const simulationTargetSchema = z.discriminatedUnion("type", [
    propertyTargetSchema,
    areaTargetSchema,
    deviceTargetSchema,
])

// ─── Input modes ─────────────────────────────────────────────────────────────
// Modo A — kWh direto: o usuário já sabe o consumo estimado.
// Modo B — watts + horas: o sistema calcula o kWh com base na potência e uso diário.
//
// Para target=DEVICE, powerWatts é opcional no modo B:
//   se omitido, o service usará o powerWatts cadastrado no device.

const kwhDirectSchema = z.object({
    inputMode:    z.literal("KWH_DIRECT"),
    kwhConsumed:  z
        .number({ error: "kwhConsumed deve ser um número" })
        .positive({ message: "kwhConsumed deve ser maior que zero" }),
    // Campos do modo B não se aplicam
    powerWatts:      z.undefined().optional(),
    dailyUsageHours: z.undefined().optional(),
})

const wattsHoursSchema = z.object({
    inputMode:       z.literal("WATTS_HOURS"),
    // powerWatts é opcional — para DEVICE, o service pode usar o do cadastro
    powerWatts:      z
        .number({ error: "powerWatts deve ser um número" })
        .positive({ message: "powerWatts deve ser maior que zero" })
        .optional(),
    dailyUsageHours: z
        .number({ error: "dailyUsageHours deve ser um número" })
        .positive({ message: "dailyUsageHours deve ser maior que zero" })
        .max(24, { message: "dailyUsageHours não pode ultrapassar 24 horas" }),
    // Campo do modo A não se aplica
    kwhConsumed: z.undefined().optional(),
})

export const simulationInputModeSchema = z.discriminatedUnion("inputMode", [
    kwhDirectSchema,
    wattsHoursSchema,
])

// ─── Schema principal ─────────────────────────────────────────────────────────
// Combina period + target + inputMode num único objeto com .and().
// O .and() é o equivalente de TypeScript's intersection (&):
//   SimulationInput = { period, target } & (KwhDirect | WattsHours)

export const simulationInputSchema = z
    .object({
        period: simulationPeriodSchema,
        target: simulationTargetSchema,
    })
    .and(simulationInputModeSchema)

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type SimulationPeriod    = z.infer<typeof simulationPeriodSchema>
export type SimulationTarget    = z.infer<typeof simulationTargetSchema>
export type SimulationInputMode = z.infer<typeof simulationInputModeSchema>
export type SimulationInput     = z.infer<typeof simulationInputSchema>

// ─── Output ───────────────────────────────────────────────────────────────────
// Tipo do resultado retornado pelo service — não é um schema Zod,
// apenas um tipo TypeScript (sem necessidade de validação de saída).

export type SimulationResult = {
    period:          SimulationPeriod
    target:          SimulationTarget
    inputMode:       "KWH_DIRECT" | "WATTS_HOURS"
    powerWatts:      number | null   // null se inputMode = KWH_DIRECT
    dailyUsageHours: number | null   // null se inputMode = KWH_DIRECT
    kwhConsumed:     number          // calculado ou informado
    costBrl:         number          // kwhConsumed × kwhPrice da distribuidora
    kwhPrice:        number          // snapshot do preço no momento da simulação
    projectedDays:   number          // 1 | 30 | 365
}