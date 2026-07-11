import { cn } from "@/lib/cn"
import { GRANULARITY_LABELS, type Granularity } from "@/types/consumption.types"

interface GranularityTabsProps {
    granularities: readonly Granularity[]
    value: Granularity
    onChange: (next: Granularity) => void
}

/**
 * Seletor de granularidade (Hora/Dia nas details pages; +Mês/Ano em
 * /relatorios) — substitui o antigo `ConsumptionPeriodFilter`. Sem opção
 * "Tudo": ao contrário do modelo antigo (registros manuais), consumo
 * agregado sempre tem uma granularidade ativa.
 */
export const GranularityTabs = ({
    granularities,
    value,
    onChange,
}: GranularityTabsProps) => (
    <div
        role="tablist"
        aria-label="Granularidade do consumo"
        className="flex flex-wrap gap-2"
        data-testid="granularity-tabs"
    >
        {granularities.map((granularity) => {
            const isActive = value === granularity
            return (
                <button
                    key={granularity}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onChange(granularity)}
                    data-testid={`granularity-tab-${granularity}`}
                    className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
                        isActive
                            ? "bg-brand-500 text-white shadow-sm hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
                    )}
                >
                    {GRANULARITY_LABELS[granularity]}
                </button>
            )
        })}
    </div>
)
