import { useState, type FormEvent } from "react"
import { ChartLine } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { SERIES_METRICS } from "@/lib/meterReadingSeries"
import {
    validateComparePeriods,
    type CompareTargetGroup,
    type ComparePeriodsDates,
    type PeriodComparisonRun,
} from "@/lib/periodComparison"
import type { MeterReadingSeriesMetric } from "@/types/meterReadingSeries.types"

interface PeriodComparisonFormProps {
    /** Alvos disponíveis; precisa ter ao menos uma opção. */
    groups: CompareTargetGroup[]
    onSubmit: (run: PeriodComparisonRun) => void
    /** Mostra o botão em carregamento enquanto a comparação submetida é buscada. */
    isSubmitting?: boolean
}

const EMPTY_DATES: ComparePeriodsDates = { aStart: "", aEnd: "", bStart: "", bEnd: "" }

/**
 * Formulário "Nova comparação" (LumiTrack Home v2.dc.html, bloco Histórico e
 * comparações) — alvo, grandeza e os dois períodos. O estado é um rascunho
 * local: mudar um campo não refaz nada, só "Criar comparação" monta o
 * {@link PeriodComparisonRun} que dirige a busca.
 *
 * O design admite períodos de durações diferentes "normalizados por dia";
 * aqui os dois precisam ter a mesma duração (o backend também exige), e o
 * texto de apoio do rodapé diz isso — vira a mensagem de erro quando as
 * datas preenchidas violam a regra, e o botão fica desabilitado até corrigir.
 */
export const PeriodComparisonForm = ({
    groups,
    onSubmit,
    isSubmitting = false,
}: PeriodComparisonFormProps) => {
    const options = groups.flatMap((group) => group.options)
    const [targetKey, setTargetKey] = useState(options[0]!.key)
    const [metric, setMetric] = useState<MeterReadingSeriesMetric>(SERIES_METRICS[0]!.value)
    const [dates, setDates] = useState<ComparePeriodsDates>(EMPTY_DATES)

    const validationMessage = validateComparePeriods(dates)
    const setDate = (field: keyof ComparePeriodsDates) => (value: string) =>
        setDates((current) => ({ ...current, [field]: value }))

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const target = options.find((option) => option.key === targetKey)
        if (!target || validationMessage) return
        onSubmit({ target, metric, ...dates })
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
            <TargetAndMetricFields
                groups={groups}
                targetKey={targetKey}
                onTargetChange={setTargetKey}
                metric={metric}
                onMetricChange={setMetric}
            />

            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">
                <PeriodFieldset
                    title="Período A"
                    color="var(--color-chart-blue)"
                    idPrefix="period-a"
                    start={dates.aStart}
                    end={dates.aEnd}
                    onStartChange={setDate("aStart")}
                    onEndChange={setDate("aEnd")}
                />
                <PeriodFieldset
                    title="Período B"
                    color="var(--color-chart-amber)"
                    idPrefix="period-b"
                    start={dates.bStart}
                    end={dates.bEnd}
                    onStartChange={setDate("bStart")}
                    onEndChange={setDate("bEnd")}
                />
            </div>

            <FormFooter validationMessage={validationMessage} isSubmitting={isSubmitting} />
        </form>
    )
}

interface FormFooterProps {
    validationMessage: string | null
    isSubmitting: boolean
}

const FormFooter = ({ validationMessage, isSubmitting }: FormFooterProps) => (
    <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        {validationMessage ? (
            <span role="alert" className="text-status-danger text-12-5">
                {validationMessage}
            </span>
        ) : (
            <span className="text-muted text-12-5">
                Os dois períodos devem ter a mesma duração.
            </span>
        )}
        <Button
            type="submit"
            variant="primary"
            disabled={validationMessage !== null}
            isLoading={isSubmitting}
            className="gap-2"
        >
            <ChartLine className="h-4 w-4" aria-hidden="true" />
            Criar comparação
        </Button>
    </div>
)

interface TargetAndMetricFieldsProps {
    groups: CompareTargetGroup[]
    targetKey: string
    onTargetChange: (key: string) => void
    metric: MeterReadingSeriesMetric
    onMetricChange: (metric: MeterReadingSeriesMetric) => void
}

const TargetAndMetricFields = ({
    groups,
    targetKey,
    onTargetChange,
    metric,
    onMetricChange,
}: TargetAndMetricFieldsProps) => (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">
        <Select
            label="Alvo"
            value={targetKey}
            onChange={(event) => onTargetChange(event.target.value)}
        >
            {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                        <option key={option.key} value={option.key}>
                            {option.label}
                        </option>
                    ))}
                </optgroup>
            ))}
        </Select>
        <Select
            label="Grandeza medida"
            value={metric}
            onChange={(event) => onMetricChange(event.target.value as MeterReadingSeriesMetric)}
        >
            {SERIES_METRICS.map((definition) => (
                <option key={definition.value} value={definition.value}>
                    {definition.label}
                </option>
            ))}
        </Select>
    </div>
)

interface PeriodFieldsetProps {
    title: string
    /** Cor do marcador — a mesma da série no gráfico, para o usuário associar. */
    color: string
    idPrefix: string
    start: string
    end: string
    onStartChange: (value: string) => void
    onEndChange: (value: string) => void
}

const PeriodFieldset = ({
    title,
    color,
    idPrefix,
    start,
    end,
    onStartChange,
    onEndChange,
}: PeriodFieldsetProps) => (
    <div
        role="group"
        aria-labelledby={`${idPrefix}-title`}
        className="border-divider flex flex-col gap-3 border px-4 pt-3.5 pb-4"
    >
        <span
            id={`${idPrefix}-title`}
            className="font-heading text-11 inline-flex items-center gap-2 leading-none font-semibold tracking-[.08em] uppercase"
        >
            <span aria-hidden="true" className="h-2.5 w-2.5" style={{ backgroundColor: color }} />
            {title}
        </span>
        <div className="grid grid-cols-2 gap-3">
            <Input
                id={`${idPrefix}-start`}
                type="date"
                label="Início"
                value={start}
                onChange={(event) => onStartChange(event.target.value)}
                required
            />
            <Input
                id={`${idPrefix}-end`}
                type="date"
                label="Fim"
                value={end}
                onChange={(event) => onEndChange(event.target.value)}
                required
            />
        </div>
    </div>
)
