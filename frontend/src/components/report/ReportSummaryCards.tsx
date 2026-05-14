import { Zap, Wallet, Hash, Gauge } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatKwh, formatCostBrl } from "@/lib/formatters/consumption"
import { ReportTrendBadge } from "@/components/report/ReportTrendBadge"
import type { ReportSummary } from "@/types/report.types"

interface ReportSummaryCardsProps {
    summary: ReportSummary
}

/**
 * Grid de 4 cards com as métricas do summary + trend badge.
 *
 * Layout: 1 coluna no mobile, 2 colunas em sm:, 4 colunas em lg:. Cabe
 * confortável em telas a partir de ~1024px sem espremer os números.
 *
 * O trend badge fica embutido no card de kWh — semanticamente é uma
 * adjetivação do "quanto consumiu" (subiu / caiu / estável). Antes
 * havia a opção de um card próprio só pra trend, mas isso desperdiça
 * espaço (a info é uma pílula curta) e cria desbalanço visual entre
 * cards com NÚMERO e card com BADGE.
 *
 * Card layout:
 *   - ícone à esquerda (cor brand sutil),
 *   - label pequena (tipo "Consumo total"),
 *   - valor grande tabular ("12,50 kWh"),
 *   - trend badge à direita (só no card de kWh).
 */
export const ReportSummaryCards = ({ summary }: ReportSummaryCardsProps) => (
    <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="report-summary-cards"
    >
        <SummaryCard
            icon={Zap}
            label="Consumo total"
            value={`${formatKwh(summary.totalKwh)} kWh`}
            testId="report-summary-totalKwh"
            trailing={<ReportTrendBadge trend={summary.trend} />}
        />

        <SummaryCard
            icon={Wallet}
            label="Custo total"
            value={formatCostBrl(summary.totalCostBrl)}
            testId="report-summary-totalCost"
        />

        <SummaryCard
            icon={Hash}
            label="Registros"
            value={String(summary.recordCount)}
            testId="report-summary-recordCount"
        />

        <SummaryCard
            icon={Gauge}
            label="Média por registro"
            value={`${formatKwh(summary.avgKwhPerRecord)} kWh`}
            testId="report-summary-avgKwh"
        />
    </div>
)

interface SummaryCardProps {
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
    label: string
    value: string
    testId: string
    trailing?: React.ReactNode
}

const SummaryCard = ({
    icon: Icon,
    label,
    value,
    testId,
    trailing,
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
            {trailing}
        </div>

        <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
            </span>
            <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {value}
            </span>
        </div>
    </div>
)