/**
 * Tipos compartilhados de Distribuidora.
 * Espelham as respostas do backend (DistributorResponse + schemas Zod).
 *
 * IMPORTANTE: kwhPrice, taxRate e publicLightingFee são `number` aqui
 * porque o backend converte os Decimal do Prisma antes de serializar.
 */

export type ElectricalSystem = "MONOPHASIC" | "BIPHASIC" | "TRIPHASIC"

/** Tensões válidas no sistema elétrico brasileiro suportadas pelo schema */
export const VALID_VOLTAGES = [110, 127, 220, 380, 440, 660, 13800] as const
export type Voltage = (typeof VALID_VOLTAGES)[number]

/** Distribuidora retornada pela API */
export interface Distributor {
    id: string
    userId: string
    name: string
    cnpj: string
    electricalSystem: ElectricalSystem
    workingVoltage: number
    kwhPrice: number
    /** Alíquota de impostos (0–1, ex: 0.12 = 12%) */
    taxRate: number | null
    /** Contribuição de iluminação pública (BRL) */
    publicLightingFee: number | null
    createdAt: string
    updatedAt: string
}

/** Input do form de criação — vai como body do POST /api/distributors */
export interface CreateDistributorInput {
    name: string
    cnpj: string
    electricalSystem: ElectricalSystem
    workingVoltage: number
    kwhPrice: number
    taxRate?: number
    publicLightingFee?: number
}

/**
 * Input do form de edição.
 * CNPJ é imutável após criar — não está aqui de propósito.
 */
export type UpdateDistributorInput = Partial<Omit<CreateDistributorInput, "cnpj">>

/** Labels em português para o sistema elétrico (UI helper) */
export const ELECTRICAL_SYSTEM_LABELS: Record<ElectricalSystem, string> = {
    MONOPHASIC: "Monofásico",
    BIPHASIC: "Bifásico",
    TRIPHASIC: "Trifásico",
}