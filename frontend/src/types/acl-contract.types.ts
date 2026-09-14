/**
 * Contrato de energia do Mercado Livre (ACL) — comercializadora, submercado,
 * fonte e o preço/volume negociados bilateralmente. Espelha
 * `AclContractResponse` do backend (`acl-contract.repository.ts`).
 */

/** Submercado de energia (CCEE/ONS) — localiza o PLD de referência do contrato. */
export type AclSubmarket = "NORTH" | "NORTHEAST" | "SOUTHEAST_CENTER_WEST" | "SOUTH"

export const ACL_SUBMARKET_LABELS: Record<AclSubmarket, string> = {
    NORTH: "Norte",
    NORTHEAST: "Nordeste",
    SOUTHEAST_CENTER_WEST: "Sudeste / Centro-Oeste",
    SOUTH: "Sul",
}

/** Classificação regulatória da fonte contratada — incentivadas têm desconto de TUSD/TE, não modelado nesta fase. */
export type AclEnergySource = "CONVENTIONAL" | "INCENTIVIZED_50" | "INCENTIVIZED_100"

export const ACL_ENERGY_SOURCE_LABELS: Record<AclEnergySource, string> = {
    CONVENTIONAL: "Convencional",
    INCENTIVIZED_50: "Incentivada 50%",
    INCENTIVIZED_100: "Incentivada 100%",
}

/** Contrato retornado pela API. */
export interface AclContract {
    id: string
    userId: string
    propertyId: string
    retailerName: string
    submarket: AclSubmarket
    energySource: AclEnergySource
    /** R$/MWh — TE negociada, substitui a TE do catálogo regulado na conta. */
    energyPricePerMwh: number
    contractedVolumeMwh: number
    validFrom: string
    /** Vigência em aberto (contrato corrente) quando `null`. */
    validTo: string | null
    createdAt: string
    updatedAt: string
}

/** Input de criação — body do POST /api/acl-contracts. */
export interface CreateAclContractInput {
    propertyId: string
    retailerName: string
    submarket: AclSubmarket
    energySource: AclEnergySource
    energyPricePerMwh: number
    contractedVolumeMwh: number
    validFrom: string
    validTo?: string
}

/** Input de edição — `propertyId` é imutável após a criação. */
export type UpdateAclContractInput = Partial<Omit<CreateAclContractInput, "propertyId">>
