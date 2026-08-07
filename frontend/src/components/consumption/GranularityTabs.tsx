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
export const GranularityTabs = ({ granularities, value, onChange }: GranularityTabsProps) => (
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
                    data-on={isActive}
                    onClick={() => onChange(granularity)}
                    data-testid={`granularity-tab-${granularity}`}
                    className="lt-selbtn"
                >
                    {GRANULARITY_LABELS[granularity]}
                </button>
            )
        })}
    </div>
)
