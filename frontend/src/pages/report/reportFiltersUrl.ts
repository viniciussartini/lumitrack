import type { ReportFilters, ReportPeriod } from "@/types/report.types"

const VALID_PERIODS: ReportPeriod[] = ["DAILY", "MONTHLY", "ANNUAL"]
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

/**
 * URL ↔ ReportFilters.
 *
 * Extraído em módulo próprio porque:
 *   1. é compartilhado entre as 3 ReportPage's (Property/Area/Device),
 *   2. é a única lógica não-trivial das páginas que merece teste isolado
 *      (URL parsing tem edge cases: ?period=XYZ, datas malformadas etc),
 *   3. fica testável sem montar React Router.
 *
 * NÃO usamos o `reportFiltersSchema` aqui apesar de ele cobrir o mesmo
 * domínio. Razão: aqui o objetivo é "limpeza permissiva" (ignorar valores
 * inválidos e cair no default), não "validar fortemente" (Zod aborta).
 * O Zod fica reservado pra contexto de form se algum dia houver.
 */

/**
 * Lê os filtros da URL. Valores inválidos são ignorados — não jogam erro.
 *
 * Critério de "inválido":
 *   - period diferente de DAILY/MONTHLY/ANNUAL → cai no default
 *   - dateFrom/dateTo fora do formato YYYY-MM-DD → vira undefined
 *   - dateFrom > dateTo → mantemos ambos e deixamos a UI sinalizar
 *     (consistente com o ReportFilters renderizar o erro inline)
 */
export const parseReportFiltersFromParams = (
    params: URLSearchParams,
    defaults: ReportFilters,
): ReportFilters => {
    const rawPeriod = params.get("period")
    const period =
        rawPeriod && (VALID_PERIODS as string[]).includes(rawPeriod)
            ? (rawPeriod as ReportPeriod)
            : defaults.period

    const rawDateFrom = params.get("dateFrom")
    const dateFrom =
        rawDateFrom && isoDateRegex.test(rawDateFrom) ? rawDateFrom : undefined

    const rawDateTo = params.get("dateTo")
    const dateTo =
        rawDateTo && isoDateRegex.test(rawDateTo) ? rawDateTo : undefined

    return { period, dateFrom, dateTo }
}

/**
 * Serializa filtros pra URLSearchParams.
 *
 * `period` sempre presente (é obrigatório). Datas só entram se preenchidas
 * — evita poluição do tipo `?period=MONTHLY&dateFrom=&dateTo=`.
 */
export const serializeReportFiltersToParams = (
    filters: ReportFilters,
): URLSearchParams => {
    const params = new URLSearchParams()
    params.set("period", filters.period)
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
    if (filters.dateTo) params.set("dateTo", filters.dateTo)
    return params
}