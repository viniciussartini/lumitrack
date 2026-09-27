import { useState, type FormEvent } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { AGGREGATION_OPTIONS, SERIES_METRICS, type SeriesRun } from "@/lib/meterReadingSeries"
import type {
    MeterReadingSeriesAggregationMinutes,
    MeterReadingSeriesMetric,
    MeterReadingSeriesWindow,
} from "@/types/meterReadingSeries.types"

const DEFAULT_AGGREGATION_MINUTES: MeterReadingSeriesAggregationMinutes = 5
const DEFAULT_HOUR = 0
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour)

interface SeriesAnalysisFormProps {
    onSubmit: (run: SeriesRun) => void
    isSubmitting?: boolean
}

/**
 * Formulário "Análise das grandezas" (LumiTrack Home v2.dc.html, bloco
 * `runGz`) — janela, dia, hora, agregação e grandeza; ao submeter, monta o
 * {@link SeriesRun} que dirige a busca. Estado local próprio (rascunho),
 * separado do que foi de fato executado: mudar um campo aqui não refaz a
 * consulta sozinho, só "Gerar análise" faz.
 *
 * Trocar a janela para "Dia" desabilita **e limpa** hora/agregação (volta
 * aos valores padrão) — trocar de volta para "Hora" começa de um estado
 * limpo, não do que estava selecionado antes de desabilitar.
 */
export const SeriesAnalysisForm = ({ onSubmit, isSubmitting = false }: SeriesAnalysisFormProps) => {
    const [window, setWindow] = useState<MeterReadingSeriesWindow>("dia")
    const [day, setDay] = useState("")
    const [hour, setHour] = useState(DEFAULT_HOUR)
    const [aggregationMinutes, setAggregationMinutes] =
        useState<MeterReadingSeriesAggregationMinutes>(DEFAULT_AGGREGATION_MINUTES)
    const [metric, setMetric] = useState<MeterReadingSeriesMetric>(SERIES_METRICS[0]!.value)

    const isHourWindowDisabled = window === "dia"

    const handleWindowChange = (next: MeterReadingSeriesWindow) => {
        setWindow(next)
        if (next === "dia") {
            setHour(DEFAULT_HOUR)
            setAggregationMinutes(DEFAULT_AGGREGATION_MINUTES)
        }
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!day) return
        const run: SeriesRun =
            window === "dia"
                ? { window, day, metric }
                : { window, day, hour, aggregationMinutes, metric }
        onSubmit(run)
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="border-divider grid grid-cols-[repeat(auto-fit,minmax(178px,1fr))] items-end gap-3.5 border-b p-5"
        >
            <Select
                label="Janela do gráfico"
                value={window}
                onChange={(event) =>
                    handleWindowChange(event.target.value as MeterReadingSeriesWindow)
                }
            >
                <option value="dia">Dia</option>
                <option value="hora">Hora</option>
            </Select>

            <Input
                type="date"
                label="Dia"
                value={day}
                onChange={(event) => setDay(event.target.value)}
                required
            />

            <HourField value={hour} onChange={setHour} disabled={isHourWindowDisabled} />

            <AggregationField
                value={aggregationMinutes}
                onChange={setAggregationMinutes}
                disabled={isHourWindowDisabled}
            />

            <MetricField value={metric} onChange={setMetric} />

            <Button type="submit" variant="primary" isLoading={isSubmitting} className="gap-2">
                <Search className="h-4 w-4" aria-hidden="true" />
                Gerar análise
            </Button>
        </form>
    )
}

interface HourFieldProps {
    value: number
    onChange: (hour: number) => void
    disabled: boolean
}

const HourField = ({ value, onChange, disabled }: HourFieldProps) => (
    <Select
        label="Hora"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
    >
        {HOUR_OPTIONS.map((hour) => (
            <option key={hour} value={hour}>
                {String(hour).padStart(2, "0")}:00
            </option>
        ))}
    </Select>
)

interface AggregationFieldProps {
    value: MeterReadingSeriesAggregationMinutes
    onChange: (minutes: MeterReadingSeriesAggregationMinutes) => void
    disabled: boolean
}

const AggregationField = ({ value, onChange, disabled }: AggregationFieldProps) => (
    <Select
        label="Agregação"
        value={value}
        onChange={(event) =>
            onChange(Number(event.target.value) as MeterReadingSeriesAggregationMinutes)
        }
        disabled={disabled}
    >
        {AGGREGATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
                {option.label}
            </option>
        ))}
    </Select>
)

interface MetricFieldProps {
    value: MeterReadingSeriesMetric
    onChange: (metric: MeterReadingSeriesMetric) => void
}

const MetricField = ({ value, onChange }: MetricFieldProps) => (
    <Select
        label="Grandeza"
        value={value}
        onChange={(event) => onChange(event.target.value as MeterReadingSeriesMetric)}
    >
        {SERIES_METRICS.map((definition) => (
            <option key={definition.value} value={definition.value}>
                {definition.label}
            </option>
        ))}
    </Select>
)
