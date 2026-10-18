import type { AclSubmarket } from "@/types/acl-contract.types"

/**
 * Comparação ACR × ACL — espelha `AclComparisonResponse` do backend
 * (`consumption.service.ts`, `GET /api/consumption/acl-comparison`).
 * Recalcula o consumo real medido da propriedade nos dois cenários; só
 * disponível para propriedade já em ACL com contrato cadastrado cobrindo o
 * período pedido.
 */
export type AclComparisonVerdict = "ACL_CHEAPER" | "ACR_CHEAPER" | "EQUIVALENT"

export interface AclComparisonMonthResult {
    monthStart: string
    acrBrl: number
    aclBrl: number
    diffBrl: number
}

/** Cotação de PLD — contexto informativo do período, nunca insumo da fórmula de custo. */
export interface PldQuoteContext {
    id: string
    submarket: AclSubmarket
    referencePeriod: string
    valuePerMwh: number
}

export interface AclComparisonResponse {
    propertyId: string
    from: string
    to: string
    months: AclComparisonMonthResult[]
    totalAcrBrl: number
    totalAclBrl: number
    totalDiffBrl: number
    diffPercent: number
    verdict: AclComparisonVerdict
    pldContext: PldQuoteContext[]
}

/** Query params de `GET /api/consumption/acl-comparison`. */
export interface AclComparisonParams {
    propertyId: string
    from: Date
    to: Date
}
