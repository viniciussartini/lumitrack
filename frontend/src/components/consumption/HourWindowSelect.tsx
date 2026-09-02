import { cn } from "@/lib/cn"

interface HourWindowSelectProps {
    value: number
    onChange: (hour: number) => void
    /** Hora corrente (0-23) — teto das opções, não dá pra consultar o futuro. */
    currentHour: number
    className?: string
}

const formatHourWindow = (hour: number) => `${hour}h - ${hour + 1}h`

/**
 * Seletor da janela de hora do dia consultada quando a granularidade "Hora"
 * está ativa em `ConsumptionSection` — sem ele, a seção sempre mostrava a
 * hora corrente, sem possibilidade de olhar horas já passadas do mesmo dia.
 */
export const HourWindowSelect = ({
    value,
    onChange,
    currentHour,
    className,
}: HourWindowSelectProps) => (
    <select
        aria-label="Janela de hora"
        data-testid="hour-window-select"
        className={cn("input lt-input w-auto", className)}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
    >
        {Array.from({ length: currentHour + 1 }, (_, hour) => (
            <option key={hour} value={hour}>
                {formatHourWindow(hour)}
            </option>
        ))}
    </select>
)
