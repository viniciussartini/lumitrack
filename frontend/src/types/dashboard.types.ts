import type { ReportResult, ReportPeriod } from "@/types/report.types"

/**
 * Tipos do Dashboard.
 *
 * O Dashboard NÃO tem endpoint próprio no backend — orquestra N chamadas
 * paralelas a `GET /api/properties/:propertyId/report` (uma por propriedade
 * do usuário) e agrega client-side.
 *
 * Reusa `ReportFilters` do módulo de relatórios (period + dateFrom + dateTo).
 * O contrato de filtro é IDÊNTICO: mesma URL sync (parse/serialize),
 * mesmo conjunto de presets, mesmo padrão de chip de período. Reaproveitar
 * o tipo evita drift de domínio entre relatório individual e dashboard.
 */

/**
 * Entrada por propriedade dentro do dashboard.
 *
 * Discriminada pelo campo `status`:
 *   - "success": result com o relatório completo daquela propriedade
 *   - "error":   alguma query falhou (provavelmente uma rede/500); o
 *                dashboard continua exibindo as demais propriedades
 *                e mostra esta como linha "indisponível" na tabela.
 *
 * Manter erro por propriedade (não global) é essencial pra UX: com 20
 * propriedades, uma única falha NÃO pode invalidar o dashboard inteiro.
 */
export interface DashboardPropertyEntry {
    propertyId: string
    propertyName: string
    status: "success" | "error"
    result: ReportResult | null
    error: string | null
}

/**
 * Breakdown agregado de tendências.
 *
 * Cada campo conta quantas propriedades têm o trend correspondente. A soma
 * dos 4 = número total de propriedades COM dados (status=success).
 *
 *   Em vez de uma "tendência média" (que esconderia casos críticos numa
 *   média de subidas e quedas), o Dashboard mostra a DISTRIBUIÇÃO. Se 3
 *   propriedades estão subindo, o user vê "3 em alta" como sinal de
 *   atenção, mesmo que outras 5 estejam estáveis e zerem a média.
 */
export interface DashboardTrendBreakdown {
    increasing: number
    decreasing: number
    stable: number
    insufficient: number
}

/**
 * Ponto agregado da série temporal cross-propriedade.
 *
 * Representa "o consumo total de TODAS as propriedades naquela data".
 *
 * - `referenceDate`: ISO string. O backend retorna records alinhados ao
 *   period escolhido (DAILY = 1 record/dia, MONTHLY = 1/mês, ANNUAL = 1/ano),
 *   então registros de propriedades distintas com o mesmo referenceDate
 *   podem ser somados com segurança — eles compartilham a mesma fatia
 *   temporal.
 * - `period`: mantido pra UI poder formatar a label do eixo X (DD/MM,
 *   MMM/YY, YYYY). Igual ao filtro ativo.
 * - `propertyCount`: quantas propriedades contribuíram com record nessa
 *   data. Útil pra tooltip ("Soma de 3 propriedades").
 */
export interface DashboardTimeSeriesPoint {
    referenceDate: string
    period: ReportPeriod
    totalKwh: number
    totalCostBrl: number
    propertyCount: number
}

/**
 * Métricas agregadas globais do dashboard.
 *
 * - `totalKwh` / `totalCostBrl` / `recordCount`: somatórios diretos entre
 *   todas as propriedades com status=success.
 * - `propertyCount`: total de propriedades do usuário (sucesso + erro).
 * - `propertyWithDataCount`: só as que retornaram pelo menos 1 record.
 *   Usado pra exibir "X de Y propriedades com dados no período".
 * - `trendBreakdown`: ver `DashboardTrendBreakdown`.
 */
export interface DashboardSummary {
    totalKwh: number
    totalCostBrl: number
    recordCount: number
    propertyCount: number
    propertyWithDataCount: number
    trendBreakdown: DashboardTrendBreakdown
}

/**
 * Estado completo agregado do dashboard.
 *
 * Saída final do `useDashboard()` quando todas as queries respondem
 * (sucesso ou erro). A página consome esse shape diretamente.
 *
 * Ordenações:
 *   - `perProperty`: ordenado por totalKwh DESC (ranking implícito);
 *     entries com status="error" vão pro final (sem kWh pra ordenar).
 *   - `timeSeries`: ordenado por referenceDate ASC (eixo X cronológico).
 */
export interface DashboardData {
    summary: DashboardSummary
    perProperty: DashboardPropertyEntry[]
    timeSeries: DashboardTimeSeriesPoint[]
}