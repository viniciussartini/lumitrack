import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react"
import { cn } from "@/lib/cn"
import type { DashboardTrendBreakdown as DashboardTrendBreakdownType } from "@/types/dashboard.types"

interface DashboardTrendBreakdownProps {
    breakdown: DashboardTrendBreakdownType
}

/**
 * Conjunto de pílulas com a distribuição de tendências entre propriedades.
 *
 * Substitui o "trend único" do relatório por uma DISTRIBUIÇÃO — em
 * dashboard cross-propriedade, mostrar uma trend média esconderia casos
 * críticos (3 em alta + 3 em queda = "estável", o que é enganoso).
 *
 * Layout: 4 pílulas em flex-wrap. Cada pílula só aparece se count > 0
 * — visualmente cleaner do que mostrar "0 em alta · 0 em queda".
 * Exceção: se TODOS forem zero (caso vazio), mostra placeholder.
 *
 * Cores semânticas reaproveitam REPORT_TREND_COLORS (queda = verde no
 * domínio de energia). Mantém coesão visual com o relatório individual.
 *
 * Acessibilidade:
 *   <ul role="list"> + cada pílula como <li>. aria-label descritivo na
 *   pílula ("2 propriedades em alta") pra leitor de tela ler contexto
 *   inteiro, não só o número.
 */

interface PillConfig {
    key: keyof DashboardTrendBreakdownType
    label: string
    plural: string
    icon: typeof TrendingUp
    classes: string
}

const pills: PillConfig[] = [
    {
        key: "increasing",
        label: "em alta",
        plural: "em alta",
        icon: TrendingUp,
        classes: cn(
            "border-amber-200 bg-amber-50 text-amber-900",
            "dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
        ),
    },
    {
        key: "decreasing",
        label: "em queda",
        plural: "em queda",
        icon: TrendingDown,
        classes: cn(
            "border-emerald-200 bg-emerald-50 text-emerald-800",
            "dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
        ),
    },
    {
        key: "stable",
        label: "estável",
        plural: "estáveis",
        icon: Minus,
        classes: cn(
            "border-slate-200 bg-slate-100 text-slate-800",
            "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
        ),
    },
    {
        key: "insufficient",
        label: "sem dados",
        plural: "sem dados",
        icon: HelpCircle,
        classes: cn(
            "border-slate-200 bg-slate-50 text-slate-500",
            "dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
        ),
    },
]

export const DashboardTrendBreakdown = ({
    breakdown,
}: DashboardTrendBreakdownProps) => {
    const total =
        breakdown.increasing +
        breakdown.decreasing +
        breakdown.stable +
        breakdown.insufficient

    if (total === 0) {
        return (
            <p
                data-testid="dashboard-trend-breakdown-empty"
                className="text-xs text-slate-500 dark:text-slate-400"
            >
                Sem dados de tendência
            </p>
        )
    }

    return (
        <ul
            role="list"
            data-testid="dashboard-trend-breakdown"
            className="flex flex-wrap items-center gap-1.5"
        >
            {pills.map(({ key, label, plural, icon: Icon, classes }) => {
                const count = breakdown[key]
                if (count === 0) return null

                const word = count === 1 ? label : plural
                const ariaLabel = `${count} ${
                    count === 1 ? "propriedade" : "propriedades"
                } ${word}`

                return (
                    <li key={key}>
                        <span
                            aria-label={ariaLabel}
                            data-testid={`dashboard-trend-pill-${key}`}
                            className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                                "text-xs font-medium",
                                classes,
                            )}
                        >
                            <Icon
                                className="h-3 w-3"
                                aria-hidden="true"
                            />
                            <span className="tabular-nums">{count}</span>
                            <span>{word}</span>
                        </span>
                    </li>
                )
            })}
        </ul>
    )
}