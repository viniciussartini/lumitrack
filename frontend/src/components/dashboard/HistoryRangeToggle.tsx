export type HistoryRange = 6 | 12

const RANGE_LABELS: Record<HistoryRange, string> = {
    6: "6 meses",
    12: "12 meses",
}

const RANGES: readonly HistoryRange[] = [6, 12]

interface HistoryRangeToggleProps {
    value: HistoryRange
    onChange: (next: HistoryRange) => void
}

/**
 * Toggle do período do histórico de consumo (bloco `isDashboard` do
 * handoff) — mesmo padrão `.lt-selbtn`/`role="tablist"` de `GranularityTabs`
 * (troca de "visão" do consumo), mas controla `pageSize` de `useConsumption`
 * a granularidade `month` fixa — não é uma troca de granularidade, é
 * quantos meses trazer.
 */
export const HistoryRangeToggle = ({ value, onChange }: HistoryRangeToggleProps) => (
    <div
        role="tablist"
        aria-label="Período do histórico de consumo"
        className="flex flex-wrap gap-2"
        data-testid="history-range-toggle"
    >
        {RANGES.map((range) => {
            const isActive = value === range
            return (
                <button
                    key={range}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    data-on={isActive}
                    onClick={() => onChange(range)}
                    data-testid={`history-range-${range}`}
                    className="lt-selbtn"
                >
                    {RANGE_LABELS[range]}
                </button>
            )
        })}
    </div>
)
