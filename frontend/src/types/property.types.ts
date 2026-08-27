/**
 * Tipos compartilhados de Propriedade.
 * Espelham as respostas do backend (PropertyResponse + schemas Zod).
 *
 * Campos opcionais no backend (address, city, state, zipCode) chegam como
 * `string | null` na resposta JSON porque o repository converte undefined→null
 * antes de persistir no Prisma.
 */

/**
 * UFs válidas — espelho do array do backend.
 * 26 estados + Distrito Federal.
 */
export const VALID_UFS = [
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
] as const

export type Uf = (typeof VALID_UFS)[number]

/**
 * Sistema elétrico da unidade consumidora — define o piso de disponibilidade
 * (30/50/100 kWh) aplicado na tarifação mensal (TariffService no backend).
 * Pertence à propriedade, não à distribuidora.
 */
export type ElectricalSystem = "MONOPHASIC" | "BIPHASIC" | "TRIPHASIC"

export const ELECTRICAL_SYSTEM_LABELS: Record<ElectricalSystem, string> = {
    MONOPHASIC: "Monofásico",
    BIPHASIC: "Bifásico",
    TRIPHASIC: "Trifásico",
}

/** Classe de faturamento Grupo B — REN 1.000/2021 (ANEEL). */
export type BillingClass = "B1" | "B2" | "B3"

export const BILLING_CLASS_LABELS: Record<BillingClass, string> = {
    B1: "B1 — Residencial",
    B2: "B2 — Rural",
    B3: "B3 — Demais classes",
}

/** Property retornada pela API */
export interface Property {
    id: string
    userId: string
    distributorId: string
    name: string
    address: string | null
    city: string | null
    /**
     * UF — chega como string crua do backend, mas só pode ser uma das VALID_UFS
     * (validado pelo Zod no backend antes de persistir).
     */
    state: string | null
    zipCode: string | null
    electricalSystem: ElectricalSystem
    billingClass: BillingClass
    /** CIP/COSIP municipal (R$) — opcional, nem todo município cobra. */
    publicLightingFeeBrl: number | null
    createdAt: string
    updatedAt: string
}

/**
 * Input do form de criação — body do POST /api/properties.
 * `distributorId` é obrigatório por regra de negócio (toda propriedade
 * tem que estar vinculada a uma distribuidora do catálogo).
 */
export interface CreatePropertyInput {
    distributorId: string
    name: string
    address?: string
    city?: string
    state?: Uf
    zipCode?: string
    electricalSystem: ElectricalSystem
    billingClass?: BillingClass
    publicLightingFeeBrl?: number
}

/**
 * Input do form de edição.
 * Diferente de Distributor (catálogo, sem edição pelo usuário), aqui
 * distributorId pode ser alterado — o backend permite trocar a distribuidora
 * vinculada.
 */
export type UpdatePropertyInput = Partial<CreatePropertyInput>
