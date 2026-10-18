/**
 * Comparação Convencional × Branca — espelha `BrancaComparisonResponse` do
 * backend (`consumption.service.ts`, `GET /api/consumption/branca-comparison`).
 * Recalcula o consumo real medido da propriedade nos dois cenários; só
 * disponível para propriedade já na Tarifa Branca (`groupBModality` WHITE).
 */
export type BrancaComparisonVerdict = "BRANCA_CHEAPER" | "CONVENCIONAL_CHEAPER" | "EQUIVALENT"

export interface BrancaComparisonMonthResult {
    monthStart: string
    convencionalBrl: number
    brancaBrl: number
    diffBrl: number
}

export interface BrancaComparisonResponse {
    propertyId: string
    from: string
    to: string
    months: BrancaComparisonMonthResult[]
    totalConvencionalBrl: number
    totalBrancaBrl: number
    totalDiffBrl: number
    diffPercent: number
    verdict: BrancaComparisonVerdict
}

/** Query params de `GET /api/consumption/branca-comparison`. */
export interface BrancaComparisonParams {
    propertyId: string
    from: Date
    to: Date
}
