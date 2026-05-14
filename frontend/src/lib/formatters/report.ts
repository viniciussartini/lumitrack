import type { ReportTrend } from "@/types/report.types"

/**
 * Formatador de timestamp "DD/MM/AAAA HH:MM".
 *
 * Único do módulo de relatórios: o `formatReferenceDate` do consumption é
 * adaptativo ao period — aqui o timestamp é fixo (sempre o instante em
 * que o backend gerou o relatório). Faz mais sentido manter local.
 */
const generatedAtFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
})

export const formatGeneratedAt = (iso: string): string =>
    generatedAtFormatter.format(new Date(iso))

/**
 * Formata um intervalo `YYYY-MM-DD` em "DD/MM/AAAA".
 *
 * O backend pode mandar tanto "2025-01-15" quanto "2025-01-15T00:00:00.000Z"
 * em dateRange — depende da rota interna. Para evitar bug de timezone
 * (uma string "2025-01-15" sozinha é parseada como UTC e pode virar
 * "14/01/2025" em America/Sao_Paulo), forçamos T12:00:00Z se a string
 * for puramente date.
 */
export const formatReportDate = (iso: string): string => {
    const hasTime = iso.includes("T")
    const safe = hasTime ? iso : `${iso}T12:00:00.000Z`
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(new Date(safe))
}

/**
 * Labels semânticos da tendência. Usados no badge da página de relatório.
 *
 * INSUFFICIENT_DATA aparece quando há menos de 2 registros — backend não
 * consegue dividir em duas metades pra comparar. UI deve mostrar isso
 * como "estado neutro", não como erro.
 */
export const REPORT_TREND_LABELS: Record<ReportTrend, string> = {
    INCREASING: "Em alta",
    DECREASING: "Em queda",
    STABLE: "Estável",
    INSUFFICIENT_DATA: "Dados insuficientes",
}

/**
 * Mapa de cor semântica para o badge.
 *
 * Atenção ao mapeamento DECREASING → verde:
 *   No domínio de monitoramento de ENERGIA, consumo em queda é GOOD
 *   (economia). Por isso DECREASING usa verde — o inverso de uma trend
 *   chart de finanças, onde queda costuma ser ruim.
 *
 * Em alta é amber (não red) — não é um erro, é só "atenção, está subindo".
 * STABLE fica em slate neutro. INSUFFICIENT_DATA em slate também — não
 * tem informação suficiente pra ser feedback semântico.
 */
export type ReportTrendColor =
    | "good"
    | "warning"
    | "neutral"
    | "muted"

export const REPORT_TREND_COLORS: Record<ReportTrend, ReportTrendColor> = {
    DECREASING: "good",
    INCREASING: "warning",
    STABLE: "neutral",
    INSUFFICIENT_DATA: "muted",
}