/**
 * Períodos suportados pelo backend (espelha o enum `ConsumptionPeriod` do Prisma).
 *
 * A escolha do período define a interpretação de `referenceDate`:
 *   HOURLY  → instante (data + hora)
 *   DAILY   → o dia exato
 *   MONTHLY → o primeiro dia do mês representa o mês inteiro
 *   ANNUAL  → o primeiro dia do ano representa o ano inteiro
 *
 * O backend valida unicidade por `period + target + referenceDate`, ou seja,
 * não dá pra ter dois registros DAILY no mesmo dia para o mesmo target — o que
 * é coerente com a semântica de "consumo do dia 15".
 */
export type ConsumptionPeriod = "HOURLY" | "DAILY" | "MONTHLY" | "ANNUAL"

/**
 * Labels traduzidas (curtas) dos períodos.
 *
 * Usadas em chips de filtro e na coluna "Período" da tabela — espaço apertado.
 * Versões longas ("Por hora", "Diário"...) ficariam ambíguas no chip ativo.
 */
export const CONSUMPTION_PERIOD_LABELS: Record<ConsumptionPeriod, string> = {
    HOURLY: "Hora",
    DAILY: "Dia",
    MONTHLY: "Mês",
    ANNUAL: "Ano",
}

/**
 * Ordem canônica dos períodos — granularidade ascendente (mais → menos detalhe).
 *
 * Garante apresentação consistente do filtro de chips em qualquer DetailsPage.
 */
export const CONSUMPTION_PERIODS: readonly ConsumptionPeriod[] = [
    "HOURLY",
    "DAILY",
    "MONTHLY",
    "ANNUAL",
] as const

/**
 * Registro de consumo (espelha o modelo Prisma `ConsumptionRecord`).
 *
 * É polimórfico: exatamente UM dos três FKs (`propertyId`, `areaId`, `deviceId`)
 * estará preenchido por registro — os outros dois serão `null`.
 *
 * `costBrl` é calculado pelo backend (kwhConsumed × kwhPrice da distribuidora
 * vinculada à propriedade). Vem `null` em registros legados/inconsistentes —
 * a UI deve tratar esse caso (renderiza "—").
 *
 * `referenceDate` é uma string ISO (com timezone). A interpretação semântica
 * depende do `period` e fica nos formatters em `lib/formatters/consumption`.
 */
export interface ConsumptionRecord {
    id: string
    propertyId: string | null
    areaId: string | null
    deviceId: string | null
    period: ConsumptionPeriod
    referenceDate: string
    kwhConsumed: number
    costBrl: number | null
    notes: string | null
    createdAt: string
    updatedAt: string
}

/**
 * Input de criação. A forma é a MESMA para os 3 targets — o que muda é a
 * URL do endpoint, não o body. `costBrl` NÃO entra aqui (calculado pelo backend).
 */
export interface CreateConsumptionInput {
    period: ConsumptionPeriod
    referenceDate: string
    kwhConsumed: number
    notes?: string
}

/**
 * Input de atualização.
 *
 * Apenas `kwhConsumed` e `notes` são editáveis — `period` e `referenceDate`
 * são identificadores (compõem a unicidade do registro). Para "alterar" o
 * período/data de um registro, é preciso excluir e recriar.
 *
 * Esse aviso de UX vai aparecer no form de edição no PR2.
 */
export interface UpdateConsumptionInput {
    kwhConsumed?: number
    notes?: string
}