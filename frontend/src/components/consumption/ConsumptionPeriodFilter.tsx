import { cn } from "@/lib/cn"
import {
    CONSUMPTION_PERIODS,
    CONSUMPTION_PERIOD_LABELS,
    type ConsumptionPeriod,
} from "@/types/consumption.types"

interface ConsumptionPeriodFilterProps {
    /** Period atual. `undefined` = "Tudo" (sem filtro aplicado). */
    value: ConsumptionPeriod | undefined
    onChange: (next: ConsumptionPeriod | undefined) => void
    /**
     * Texto auxiliar à direita (ex: "12 registros"). Quando undefined,
     * o componente não renderiza o slot — útil pra esconder durante
     * loading/erro inicial.
     */
    totalLabel?: string
}

/**
 * Filtro de período renderizado como chips toggle.
 *
 * Comportamento:
 *   - "Tudo" (value=undefined) é o estado inicial e exibe todos os períodos
 *   - Clicar num chip seleciona o period
 *   - Clicar no chip JÁ ativo volta pra "Tudo" (toggle off)
 *
 * Acessibilidade:
 *   - <div role="group"> com aria-label descritivo
 *   - Cada chip é <button type="button"> (não link, não input radio).
 *   - aria-pressed indica o chip ativo
 *
 * Os chips ficam SEMPRE habilitados — durante refetch o usuário pode
 * trocar de filtro livremente. O loading é comunicado pelo skeleton da
 * tabela, não desabilitando os chips.
 */
export const ConsumptionPeriodFilter = ({
    value,
    onChange,
    totalLabel,
}: ConsumptionPeriodFilterProps) => {
    const isAllActive = value === undefined

    return (
        <div
            role="group"
            aria-label="Filtrar por período"
            className="flex flex-wrap items-center gap-2"
            data-testid="consumption-period-filter"
        >
            <Chip
                label="Tudo"
                isActive={isAllActive}
                onClick={() => onChange(undefined)}
                testId="consumption-period-chip-all"
            />

            {CONSUMPTION_PERIODS.map((period) => {
                const isActive = value === period
                return (
                    <Chip
                        key={period}
                        label={CONSUMPTION_PERIOD_LABELS[period]}
                        isActive={isActive}
                        onClick={() => onChange(isActive ? undefined : period)}
                        testId={`consumption-period-chip-${period.toLowerCase()}`}
                    />
                )
            })}

            {totalLabel && (
                <span
                    className="ml-auto text-xs text-slate-500 dark:text-slate-400"
                    data-testid="consumption-period-total"
                >
                    {totalLabel}
                </span>
            )}
        </div>
    )
}

interface ChipProps {
    label: string
    isActive: boolean
    onClick: () => void
    testId: string
}

const Chip = ({ label, isActive, onClick, testId }: ChipProps) => (
    <button
        type="button"
        aria-pressed={isActive}
        onClick={onClick}
        data-testid={testId}
        className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
            isActive
                ? "bg-brand-500 text-white shadow-sm hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
        )}
    >
        {label}
    </button>
)