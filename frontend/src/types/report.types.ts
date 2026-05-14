import type { ConsumptionRecord } from "@/types/consumption.types"

/**
 * Períodos suportados pelo endpoint /report.
 *
 * IMPORTANTE: diferente de `ConsumptionPeriod` (que tem HOURLY), o backend
 * de relatórios aceita apenas DAILY / MONTHLY / ANNUAL. A razão é semântica:
 * relatório é uma visão agregada e tendência horária é ruído visual.
 *
 * Reaproveitar `ConsumptionPeriod` aqui seria conveniente em código, mas
 * causaria erro 422 do backend em runtime se alguém passasse "HOURLY".
 * Tipo separado garante type-safety estática.
 */
export type ReportPeriod = "DAILY" | "MONTHLY" | "ANNUAL"

/**
 * Labels longos para o filtro/cabeçalho. As versões curtas existem em
 * `CONSUMPTION_PERIOD_LABELS` ("Dia"/"Mês"/"Ano") — aqui usamos
 * "Diário"/"Mensal"/"Anual" porque o contexto do relatório tem espaço
 * (cards e cabeçalho), e a forma adjetiva soa mais natural ("Relatório
 * mensal" vs "Relatório de mês").
 */
export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
    DAILY: "Diário",
    MONTHLY: "Mensal",
    ANNUAL: "Anual",
}

/**
 * Ordem canônica — granularidade ascendente (mais → menos detalhe).
 * Mantém o filtro de chips consistente em qualquer página de relatório.
 */
export const REPORT_PERIODS: readonly ReportPeriod[] = [
    "DAILY",
    "MONTHLY",
    "ANNUAL",
] as const

/**
 * Direção da tendência do consumo no período analisado.
 *
 * O backend divide os registros em duas metades cronológicas, calcula
 * a média de kWh de cada metade, e compara via threshold de 5%:
 *   variação > +5%   → INCREASING
 *   variação < -5%   → DECREASING
 *   |variação| <= 5% → STABLE
 *   menos de 2 regs  → INSUFFICIENT_DATA
 */
export type ReportTrend =
    | "INCREASING"
    | "DECREASING"
    | "STABLE"
    | "INSUFFICIENT_DATA"

/**
 * Métricas agregadas do relatório.
 *
 * - `totalKwh`: soma de kwhConsumed dos registros filtrados.
 * - `totalCostBrl`: soma de costBrl (já calculado pelo backend com base na
 *   distribuidora vinculada). Registros com costBrl=null contribuem 0.
 * - `recordCount`: quantos registros entraram no cálculo (depois do filtro
 *   de data).
 * - `avgKwhPerRecord`: totalKwh / recordCount. Em "relatório anual com
 *   period=MONTHLY", representa a média mensal — semanticamente útil.
 *   Quando recordCount=0, vem 0 (não NaN).
 * - `trend`: ver `ReportTrend`.
 */
export interface ReportSummary {
    totalKwh: number
    totalCostBrl: number
    recordCount: number
    avgKwhPerRecord: number
    trend: ReportTrend
}

/**
 * Target tipado do relatório.
 *
 * Discriminated union pelo campo `type`. Espelha exatamente o output
 * do backend (`backend/src/modules/report/report.schema.ts`).
 *
 * Cada nível inclui os IDs dos ancestrais — em AREA temos propertyId
 * e areaId; em DEVICE temos os três. Isso simplifica a construção de
 * breadcrumbs e links pra entidade na UI.
 */
export type ReportTarget =
    | { type: "PROPERTY"; propertyId: string }
    | { type: "AREA"; propertyId: string; areaId: string }
    | { type: "DEVICE"; propertyId: string; areaId: string; deviceId: string }

/**
 * Intervalo de datas aplicado ao relatório.
 *
 * Vem `null` quando nenhum filtro de data foi enviado — backend retorna
 * todos os registros do target. As datas chegam como strings ISO 8601
 * (serializadas a partir de Date no controller).
 */
export interface ReportDateRange {
    from: string
    to: string
}

/**
 * Resposta completa do GET /api/properties/:propertyId/report.
 *
 * - `generatedAt`: timestamp ISO de quando o backend processou o relatório.
 *   Usado no cabeçalho da página ("Gerado em DD/MM/YYYY às HH:MM").
 * - `records`: a "evidência" do summary — os registros que entraram no
 *   cálculo, já filtrados por target/period/data. Renderizados na tabela.
 */
export interface ReportResult {
    generatedAt: string
    period: ReportPeriod
    target: ReportTarget
    dateRange: ReportDateRange | null
    summary: ReportSummary
    records: ConsumptionRecord[]
}

/**
 * Estado dos filtros (controlado pela página, sincronizado com URL).
 *
 * Datas em formato `YYYY-MM-DD` — o que o `<input type="date">` produz
 * nativamente. A conversão para ISO 8601 não é necessária: o backend
 * aceita esse formato via z.coerce.date() no `commonQuerySchema`.
 *
 * Trade-off da string vs Date no estado: string serializa direto pra URL
 * sem `.toISOString()`, e a UI sempre lê/escreve em "YYYY-MM-DD" — manter
 * em string evita conversões de ida e volta.
 */
export interface ReportFilters {
    period: ReportPeriod
    dateFrom?: string
    dateTo?: string
}