import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react"
import { cn } from "@/lib/cn"
import {
    REPORT_TREND_LABELS,
    REPORT_TREND_COLORS,
} from "@/lib/formatters/report"
import type { ReportTrend } from "@/types/report.types"

interface ReportTrendBadgeProps {
    trend: ReportTrend
}

/**
 * Mapa de classes Tailwind por cor semântica.
 *
 * Mantido as 4 variantes em um objeto literal (não em strings dinâmicas
 * tipo `bg-${color}-50`) porque o Tailwind precisa ver classes literais
 * em tempo de build — strings interpoladas não são detectadas e ficariam
 * sem CSS no bundle. Lição que já tomamos a sério no projeto.
 */
const colorClasses = {
    good: cn(
        "border-emerald-200 bg-emerald-50 text-emerald-800",
        "dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
    ),
    warning: cn(
        "border-amber-200 bg-amber-50 text-amber-900",
        "dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
    ),
    neutral: cn(
        "border-slate-200 bg-slate-100 text-slate-800",
        "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    ),
    muted: cn(
        "border-slate-200 bg-slate-50 text-slate-500",
        "dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
    ),
}

/**
 * Mapa trend → ícone. Tamanho fixo em h-3.5 w-3.5 no JSX abaixo —
 * mantemos os componentes como referência, não as instâncias.
 */
const trendIcons = {
    INCREASING: TrendingUp,
    DECREASING: TrendingDown,
    STABLE: Minus,
    INSUFFICIENT_DATA: HelpCircle,
} as const

/**
 * Badge de tendência do relatório.
 *
 * Composição minimalista: borda + bg-tinted + ícone + label. Mesmo
 * visual dos status badges do projeto (espelha o AlertStatusBadge,
 * mantém coesão visual).
 *
 * Sobre cor de DECREASING (verde):
 *   No DOMÍNIO de energia, queda no consumo é resultado POSITIVO
 *   (economia). Por isso DECREASING usa verde — invertido de uma
 *   trend chart financeira. A semântica está em REPORT_TREND_COLORS.
 *
 * aria-label tem o label completo + a palavra "tendência" para leitores
 * de tela contextualizarem o que a pílula representa.
 */
export const ReportTrendBadge = ({ trend }: ReportTrendBadgeProps) => {
    const Icon = trendIcons[trend]
    const label = REPORT_TREND_LABELS[trend]
    const color = REPORT_TREND_COLORS[trend]

    return (
        <span
            aria-label={`Tendência: ${label}`}
            data-testid="report-trend-badge"
            data-trend={trend}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
                "text-xs font-medium",
                colorClasses[color],
            )}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
        </span>
    )
}