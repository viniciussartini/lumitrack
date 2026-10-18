import { goalUnitLabels } from "@/lib/goals"
import type { GoalUnit } from "@/types/goal.types"

interface GoalUnitSelectorProps {
    unit: GoalUnit
    /** Unidades que a propriedade escolhida pode ter (a demanda só no Grupo A). */
    units: readonly GoalUnit[]
    onChange: (unit: GoalUnit) => void
}

/**
 * Seletor de unidade das metas (consumo em kWh, custo em R$ ou, no Grupo A, demanda em kW): o mesmo
 * toggle `.lt-selbtn` do seletor de propriedade e da unidade do Painel. A
 * página inteira — card, acompanhamento e histórico — vale para a unidade
 * escolhida.
 */
export const GoalUnitSelector = ({ unit, units, onChange }: GoalUnitSelectorProps) => (
    <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-muted text-11 mr-1 font-semibold tracking-[.08em] uppercase">
            Unidade
        </span>
        <div role="tablist" aria-label="Unidade da meta" className="flex flex-wrap gap-2">
            {units.map((option) => (
                <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={unit === option}
                    data-on={unit === option}
                    onClick={() => onChange(option)}
                    data-testid={`goal-unit-${option}`}
                    className="lt-selbtn"
                >
                    {goalUnitLabels(option).selector}
                </button>
            ))}
        </div>
    </div>
)
