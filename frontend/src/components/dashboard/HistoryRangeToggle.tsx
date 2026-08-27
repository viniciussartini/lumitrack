export type HistoryRange = "month" | 6 | 12

const RANGE_LABELS: Record<HistoryRange, string> = {
    month: "Mensal",
    6: "6 meses",
    12: "12 meses",
}

// Do mais granular pro mais amplo — mesmo sentido de leitura das abas de
// granularidade de consumo (hora → dia → mês → ano).
const RANGES: readonly HistoryRange[] = ["month", 6, 12]

interface HistoryRangeToggleProps {
    value: HistoryRange
    onChange: (next: HistoryRange) => void
}

/**
 * Toggle do período do histórico de consumo (bloco `isDashboard` do
 * handoff) — mesmo padrão `.lt-selbtn`/`role="tablist"` de `GranularityTabs`
 * (troca de "visão" do consumo).
 *
 * "6 meses"/"12 meses" controlam `pageSize` de `useConsumption` com
 * granularidade `month` fixa (sem janela — "os últimos N buckets").
 * "Mensal" muda de granularidade: consumo consolidado por
 * DIA dentro do mês corrente, do dia 1 até ontem — outra grandeza, não um
 * terceiro valor na mesma escala de meses.
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
