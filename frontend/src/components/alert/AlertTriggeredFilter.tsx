import { cn } from "@/lib/cn"

/**
 * Filtros client-side:
 *   - undefined → "Todos"
 *   - false     → "Ativos" (triggeredAt === null)
 *   - true      → "Disparados" (triggeredAt !== null)
 *
 * Mesmo tipo que ListAlertQuery.triggered, mantendo a porta aberta para
 * eventual server-side futuro sem mudar a assinatura do componente.
 */
export type TriggeredFilterValue = boolean | undefined

interface AlertTriggeredFilterProps {
    value: TriggeredFilterValue
    onChange: (next: TriggeredFilterValue) => void
    /**
     * Texto auxiliar à direita (ex: "3 disparados"). Quando undefined,
     * o componente não renderiza o slot.
     */
    totalLabel?: string
}

/**
 * Filtro de triggered renderizado como chips toggle.
 *
 * Espelha 1:1 o pattern do ConsumptionPeriodFilter:
 *   - chips toggle com role="group" + aria-pressed
 *   - clicar no chip JÁ ativo volta para "Todos" (toggle off)
 *   - sempre habilitados durante refetch (loading no skeleton da tabela)
 *
 * Não há "ordem canônica" tão clara quanto o consumption (HOURLY < DAILY <
 * MONTHLY < ANNUAL). Aqui escolhi: Todos → Ativos → Disparados.
 * Razão: do mais inclusivo para o mais específico, e "Disparados" no fim
 * por ser o filtro mais usado (chama atenção visual no canto direito).
 */
export const AlertTriggeredFilter = ({
    value,
    onChange,
    totalLabel,
}: AlertTriggeredFilterProps) => {
    const isAllActive = value === undefined
    const isActiveActive = value === false
    const isTriggeredActive = value === true

    return (
        <div
            role="group"
            aria-label="Filtrar por status do alerta"
            className="flex flex-wrap items-center gap-2"
            data-testid="alert-triggered-filter"
        >
            <Chip
                label="Todos"
                isActive={isAllActive}
                onClick={() => onChange(undefined)}
                testId="alert-triggered-chip-all"
            />
            <Chip
                label="Ativos"
                isActive={isActiveActive}
                // Toggle: se já está em "Ativos" e clico, volta pra "Todos"
                onClick={() => onChange(isActiveActive ? undefined : false)}
                testId="alert-triggered-chip-active"
            />
            <Chip
                label="Disparados"
                isActive={isTriggeredActive}
                onClick={() => onChange(isTriggeredActive ? undefined : true)}
                testId="alert-triggered-chip-triggered"
            />

            {totalLabel && (
                <span
                    className="ml-auto text-xs text-slate-500 dark:text-slate-400"
                    data-testid="alert-triggered-total"
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