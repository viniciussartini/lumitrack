import { useMemo, useState, type FormEvent } from "react"
import { FileText } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import type { CompareTargetGroup } from "@/lib/periodComparison"
import {
    buildCreateReportInput,
    buildMonthOptions,
    isReportPeriodFilled,
    reportTypeOptionsFor,
    usesMonthPeriod,
    validateReportForm,
    type MonthOption,
    type ReportFormState,
} from "@/lib/reportForm"
import type { CreateReportInput, ReportFormat, ReportType } from "@/types/report.types"

interface ReportEmissionFormProps {
    /** Alvos disponíveis; precisa ter ao menos uma opção. */
    groups: CompareTargetGroup[]
    onSubmit: (input: CreateReportInput) => void
    /** Mostra o botão em carregamento enquanto o relatório é gerado. */
    isSubmitting?: boolean
}

const MONTHS_LISTED = 24
const VALIDATION_MESSAGE_ID = "report-validation"
const FORMATS: readonly ReportFormat[] = ["PDF", "CSV"]

/**
 * Formulário "Gerar relatório agora" (LumiTrack Home v2.dc.html, view
 * `reports`) — escopo, tipo, período e formato. O estado é um rascunho local:
 * só "Gerar relatório" monta o pedido. O período depende do tipo: o mensal e
 * a demanda pedem um mês, os demais pedem início e fim. A demanda só é
 * oferecida para propriedade do Grupo A.
 */
export const ReportEmissionForm = ({
    groups,
    onSubmit,
    isSubmitting = false,
}: ReportEmissionFormProps) => {
    const options = groups.flatMap((group) => group.options)
    const monthOptions = useMemo(() => buildMonthOptions(new Date(), MONTHS_LISTED), [])
    const [targetKey, setTargetKey] = useState(options[0]!.key)
    // A árvore pode ser recarregada com o alvo escolhido já inexistente: cai
    // para a primeira opção válida em vez de deixar o envio sem efeito.
    const target = options.find((option) => option.key === targetKey) ?? options[0]!
    const [state, setState] = useState<ReportFormState>({
        type: "MONTHLY",
        month: monthOptions[0]!.value,
        start: "",
        end: "",
        format: "PDF",
    })

    const update = (patch: Partial<ReportFormState>) =>
        setState((current) => ({ ...current, ...patch }))
    const typeOptions = reportTypeOptionsFor(target)

    // Trocar para um alvo que não comporta o tipo escolhido (a demanda) volta ao mensal.
    const changeTarget = (key: string) => {
        setTargetKey(key)
        const next = options.find((option) => option.key === key)
        if (next && !reportTypeOptionsFor(next).some((option) => option.value === state.type)) {
            update({ type: "MONTHLY" })
        }
    }
    const validationMessage = validateReportForm(state)
    const canSubmit = validationMessage === null && isReportPeriodFilled(state)

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!canSubmit) return
        onSubmit(buildCreateReportInput(state, target))
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
            <TargetAndTypeFields
                groups={groups}
                targetKey={target.key}
                onTargetChange={changeTarget}
                typeOptions={typeOptions}
                type={state.type}
                onTypeChange={(type) => update({ type })}
            />

            <PeriodFields
                state={state}
                monthOptions={monthOptions}
                validationMessage={validationMessage}
                onChange={update}
            />

            <FormatToggle value={state.format} onChange={(format) => update({ format })} />

            <FormFooter
                validationMessage={validationMessage}
                canSubmit={canSubmit}
                isSubmitting={isSubmitting}
            />
        </form>
    )
}

interface PeriodFieldsProps {
    state: ReportFormState
    monthOptions: MonthOption[]
    validationMessage: string | null
    onChange: (patch: Partial<ReportFormState>) => void
}

// O período depende do tipo: os de mês escolhem um mês, os demais escolhem
// início e fim.
const PeriodFields = ({ state, monthOptions, validationMessage, onChange }: PeriodFieldsProps) => {
    if (usesMonthPeriod(state.type)) {
        return (
            <Select
                label="Mês"
                value={state.month}
                onChange={(event) => onChange({ month: event.target.value })}
            >
                {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </Select>
        )
    }

    const describedBy = validationMessage ? VALIDATION_MESSAGE_ID : undefined
    return (
        <div className="grid grid-cols-2 gap-3">
            <Input
                id="report-start"
                type="date"
                label="Início"
                value={state.start}
                onChange={(event) => onChange({ start: event.target.value })}
                required
                aria-invalid={validationMessage !== null}
                aria-describedby={describedBy}
            />
            <Input
                id="report-end"
                type="date"
                label="Fim"
                value={state.end}
                onChange={(event) => onChange({ end: event.target.value })}
                required
                aria-invalid={validationMessage !== null}
                aria-describedby={describedBy}
            />
        </div>
    )
}

interface FormatToggleProps {
    value: ReportFormat
    onChange: (format: ReportFormat) => void
}

const FormatToggle = ({ value, onChange }: FormatToggleProps) => (
    <div className="field">
        <span id="report-format-label" className="text-text/70 text-xs">
            Formato
        </span>
        <div role="group" aria-labelledby="report-format-label" className="mt-0.5 flex gap-1.5">
            {FORMATS.map((format) => (
                <button
                    key={format}
                    type="button"
                    className="lt-selbtn"
                    data-on={value === format}
                    aria-pressed={value === format}
                    onClick={() => onChange(format)}
                >
                    {format}
                </button>
            ))}
        </div>
    </div>
)

interface FormFooterProps {
    validationMessage: string | null
    canSubmit: boolean
    isSubmitting: boolean
}

const FormFooter = ({ validationMessage, canSubmit, isSubmitting }: FormFooterProps) => (
    <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        {validationMessage ? (
            <span id={VALIDATION_MESSAGE_ID} role="alert" className="text-status-danger text-12-5">
                {validationMessage}
            </span>
        ) : (
            <span />
        )}
        <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            isLoading={isSubmitting}
            className="gap-2"
        >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Gerar relatório
        </Button>
    </div>
)

interface TargetAndTypeFieldsProps {
    groups: CompareTargetGroup[]
    targetKey: string
    onTargetChange: (key: string) => void
    typeOptions: readonly { value: ReportType; label: string }[]
    type: ReportType
    onTypeChange: (type: ReportType) => void
}

const TargetAndTypeFields = ({
    groups,
    targetKey,
    onTargetChange,
    typeOptions,
    type,
    onTypeChange,
}: TargetAndTypeFieldsProps) => (
    <>
        <Select
            label="Escopo"
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
            label="Tipo de relatório"
            value={type}
            onChange={(event) => onTypeChange(event.target.value as ReportType)}
        >
            {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </Select>
    </>
)
