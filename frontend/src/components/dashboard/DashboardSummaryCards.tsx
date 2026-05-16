import { Zap, Wallet, Building2, Activity } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatKwh, formatCostBrl } from "@/lib/formatters/consumption"
import { DashboardTrendBreakdown } from "@/components/dashboard/DashboardTrendBreakdown"
import type { DashboardSummary } from "@/types/dashboard.types"

interface DashboardSummaryCardsProps {
    summary: DashboardSummary
}

/**
 * Grid de 4 cards com as métricas globais do dashboard.
 *
 * Métricas escolhidas (alinhado às decisões de UX confirmadas):
 *   1. Consumo total (kWh)       — agregado entre todas as propriedades
 *   2. Custo total (R$)          — agregado entre todas as propriedades
 *   3. Propriedades (X de Y)     — Y total, X com dados no range
 *   4. Tendências (breakdown)    — pílulas distribuindo INC/DEC/STAB/INS
 *
 * Por que "X de Y" no card de propriedades:
 *   Mostrar só o total esconde informação útil. Se o user tem 5 propriedades
 *   mas só 2 com dados no período filtrado, ele vê isso imediatamente —
 *   ou ajusta o filtro, ou cadastra registros nas demais.
 *
 * O card de tendências é um SLOT — não exibe um valor único, mas as pílulas
 * do DashboardTrendBreakdown. Visualmente quebra a uniformidade ("texto
 * grande" vs "várias pílulas pequenas") mas a info é essencial e nenhum
 * outro lugar do dashboard a expõe de forma consolidada.
 */
export const DashboardSummaryCards = ({
    summary,
}: DashboardSummaryCardsProps) => (
    <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="dashboard-summary-cards"
    >
        <SummaryCard
            icon={Zap}
            label="Consumo total"
            testId="dashboard-summary-totalKwh"
        >
            <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatKwh(summary.totalKwh)} kWh
            </span>
        </SummaryCard>

        <SummaryCard
            icon={Wallet}
            label="Custo total"
            testId="dashboard-summary-totalCost"
        >
            <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCostBrl(summary.totalCostBrl)}
            </span>
        </SummaryCard>

        <SummaryCard
            icon={Building2}
            label="Propriedades"
            testId="dashboard-summary-properties"
        >
            <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {summary.propertyWithDataCount}
                <span className="text-base font-medium text-slate-500 dark:text-slate-400">
                    {" de "}
                    {summary.propertyCount}
                </span>
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
                com dados no período
            </span>
        </SummaryCard>

        <SummaryCard
            icon={Activity}
            label="Tendências"
            testId="dashboard-summary-trends"
        >
            <DashboardTrendBreakdown breakdown={summary.trendBreakdown} />
        </SummaryCard>
    </div>
)

interface SummaryCardProps {
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
    label: string
    testId: string
    children: React.ReactNode
}

const SummaryCard = ({
    icon: Icon,
    label,
    testId,
    children,
}: SummaryCardProps) => (
    <div
        data-testid={testId}
        className={cn(
            "flex flex-col gap-2 rounded-lg border p-4",
            "border-slate-200 bg-white",
            "dark:border-slate-800 dark:bg-slate-950",
        )}
    >
        <div className="flex items-center justify-between">
            <div
                className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-md",
                    "bg-brand-50 text-brand-700",
                    "dark:bg-brand-950/40 dark:text-brand-300",
                )}
            >
                <Icon className="h-4 w-4" aria-hidden={true} />
            </div>
        </div>

        <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
            </span>
            {children}
        </div>
    </div>
)