import { Select } from "@/components/ui/Select"

interface HourWindowSelectProps {
    value: number
    onChange: (hour: number) => void
    /** Hora corrente (0-23) — teto das opções, não dá pra consultar o futuro. */
    currentHour: number
}

const formatHourWindow = (hour: number) => `${hour}h - ${hour + 1}h`

/**
 * Seletor da janela de hora do dia consultada quando a granularidade "Hora"
 * está ativa em `ConsumptionSection`: oferece as janelas de 0h-1h até a
 * hora corrente, sem opções no futuro.
 */
export const HourWindowSelect = ({ value, onChange, currentHour }: HourWindowSelectProps) => (
    <Select
        aria-label="Janela de hora"
        data-testid="hour-window-select"
        className="w-auto"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
    >
        {Array.from({ length: currentHour + 1 }, (_, hour) => (
            <option key={hour} value={hour}>
                {formatHourWindow(hour)}
            </option>
        ))}
    </Select>
)
