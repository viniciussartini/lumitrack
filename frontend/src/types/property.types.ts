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

/**
 * Grupo tarifário (ADR-0019 do backend) — GROUP_B é o monômio de sempre
 * (billingClass); GROUP_A é o binômio (subgrupo + modalidade + demanda
 * contratada).
 */
export type TariffGroup = "GROUP_A" | "GROUP_B"

/** Subgrupo do Grupo A — REN 1.000/2021, definido pela tensão de fornecimento. */
export type TariffSubgroup = "A1" | "A2" | "A3" | "A3A" | "A4" | "AS"

export const TARIFF_SUBGROUP_LABELS: Record<TariffSubgroup, string> = {
    A1: "A1 — 230 kV ou mais",
    A2: "A2 — 88 a 138 kV",
    A3: "A3 — 69 kV",
    A3A: "A3a — 30 a 44 kV",
    A4: "A4 — 2,3 a 25 kV",
    AS: "AS — sistema subterrâneo",
}

/**
 * Modalidade tarifária do Grupo A. Só GREEN tem cálculo de conta implementado
 * no backend (ConsumptionService lança erro claro para as outras) — o mapa de
 * labels cobre as 3 para exibição, mas o formulário só oferece GREEN até a
 * Fase 20 trazer Azul/Convencional.
 */
export type TariffModality = "CONVENTIONAL_BINOMIAL" | "GREEN" | "BLUE"

export const TARIFF_MODALITY_LABELS: Record<TariffModality, string> = {
    CONVENTIONAL_BINOMIAL: "Convencional Binômia",
    GREEN: "Horária Verde",
    BLUE: "Horária Azul",
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
    tariffGroup: TariffGroup
    /** Null para propriedades do Grupo A. */
    billingClass: BillingClass | null
    /** Null para propriedades do Grupo B. */
    tariffSubgroup: TariffSubgroup | null
    /** Null para propriedades do Grupo B. */
    tariffModality: TariffModality | null
    /** Demanda contratada (kW) — null para propriedades do Grupo B. */
    contractedDemandKw: number | null
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
    tariffGroup?: TariffGroup
    billingClass?: BillingClass
    tariffSubgroup?: TariffSubgroup
    tariffModality?: TariffModality
    contractedDemandKw?: number
    publicLightingFeeBrl?: number
}

/**
 * Input do form de edição.
 * Diferente de Distributor (catálogo, sem edição pelo usuário), aqui
 * distributorId pode ser alterado — o backend permite trocar a distribuidora
 * vinculada.
 */
export type UpdatePropertyInput = Partial<CreatePropertyInput>
