/**
 * Tipos compartilhados de Distribuidora.
 *
 * A distribuidora é um catálogo GLOBAL
 * somente leitura, populado via seed — não tem dono (`userId`) nem
 * CRUD pelo usuário. Os campos de tarifação mudaram de um único `kwhPrice`
 * para a composição real Grupo B: TUSD + TE, e as três alíquotas de
 * tributos (ICMS/PIS/COFINS) aplicadas "por dentro" pelo TariffService.
 *
 * `tusdPerKwh`, `tePerKwh`, `icmsRate`, `pisRate`, `cofinsRate` são `number`
 * aqui porque o backend converte os Decimal do Prisma antes de serializar.
 */

/** Distribuidora retornada pela API (GET /api/distributors) */
export interface Distributor {
    id: string
    name: string
    cnpj: string
    /** UF onde a distribuidora atua */
    state: string
    /** Tarifa de Uso do Sistema de Distribuição, R$/kWh */
    tusdPerKwh: number
    /** Tarifa de Energia, R$/kWh */
    tePerKwh: number
    /** Alíquota de ICMS (0–1, ex: 0.18 = 18%) */
    icmsRate: number
    /** Alíquota de PIS (0–1) */
    pisRate: number
    /** Alíquota de COFINS (0–1) */
    cofinsRate: number
    createdAt: string
    updatedAt: string
}
