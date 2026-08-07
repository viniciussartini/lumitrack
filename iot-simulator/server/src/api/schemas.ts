import { z } from "zod"

export const deviceProfileSchema = z.enum([
    "RESIDENTIAL_STEADY",
    "COMMERCIAL_HVAC",
    "INDUSTRIAL_MOTOR",
    "CUSTOM",
])

export const deviceParamsSchema = z.object({
    nominalVoltage: z.number().positive(),
    nominalPowerW: z.number().positive(),
    powerFactorBase: z.number().min(0).max(1),
    noiseAmplitudePercent: z.number().min(0).max(100),
    profile: deviceProfileSchema,
})

export const createNetworkSchema = z.object({
    name: z.string().min(1),
})

export const createDeviceSchema = z.object({
    name: z.string().min(1),
    topic: z.string().min(1),
    params: deviceParamsSchema.partial().optional(),
})

export const updateDeviceSchema = z.object({
    name: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
    params: deviceParamsSchema.partial().optional(),
})

export const powerSchema = z.object({
    on: z.boolean(),
})

export const anomalySchema = z.object({
    multiplier: z.number().positive().default(3),
    durationSeconds: z.number().positive().default(30),
})
