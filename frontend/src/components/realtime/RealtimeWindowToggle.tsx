export type RealtimeWindow = "1h" | "24h"

const WINDOW_LABELS: Record<RealtimeWindow, string> = {
    "1h": "Última hora",
    "24h": "24 horas",
}

const WINDOWS: readonly RealtimeWindow[] = ["1h", "24h"]

interface RealtimeWindowToggleProps {
    value: RealtimeWindow
    onChange: (next: RealtimeWindow) => void
}

/**
 * Toggle da janela do gráfico "Consumo em tempo real" (bloco `isDashboard`
 * do handoff, também usado em Propriedade/Área/Dispositivo — `RealtimeChartCard`)
 * — mesmo padrão `.lt-selbtn` de `GranularityTabs`, mas deliberadamente um
 * componente à parte: a janela aqui é a agregação minuto/hora de
 * `/api/meter-readings` (issue #211), não a `Granularity` de
 * `/api/consumption` (conceito diferente, mesmo que visualmente pareça).
 */
export const RealtimeWindowToggle = ({ value, onChange }: RealtimeWindowToggleProps) => (
    <div
        role="tablist"
        aria-label="Janela do gráfico de consumo em tempo real"
        className="flex flex-wrap gap-2"
        data-testid="realtime-window-toggle"
    >
        {WINDOWS.map((window) => {
            const isActive = value === window
            return (
                <button
                    key={window}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    data-on={isActive}
                    onClick={() => onChange(window)}
                    data-testid={`realtime-window-${window}`}
                    className="lt-selbtn"
                >
                    {WINDOW_LABELS[window]}
                </button>
            )
        })}
    </div>
)
