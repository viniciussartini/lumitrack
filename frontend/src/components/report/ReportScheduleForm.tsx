import { useId, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import type { CompareTargetGroup } from "@/lib/periodComparison"
import {
    FREQUENCY_OPTIONS,
    INITIAL_SCHEDULE_FORM,
    MAX_RECIPIENTS,
    WEEKDAY_OPTIONS,
    applyScheduleFrequency,
    applyScheduleType,
    buildScheduleInput,
    isScheduleFormFilled,
    scheduleToFormState,
    validateScheduleForm,
    type ScheduleFormState,
} from "@/lib/reportSchedule"
import { REPORT_TYPE_OPTIONS } from "@/lib/reportForm"
import type {
    ReportFormat,
    ReportFrequency,
    ReportSchedule,
    ReportScheduleInput,
    ReportType,
} from "@/types/report.types"

interface ReportScheduleFormProps {
    /** Alvos disponíveis; precisa ter ao menos uma opção. */
    groups: CompareTargetGroup[]
    /** Presente na edição: preenche o rascunho com a configuração salva. */
    initial?: ReportSchedule
    onSubmit: (input: ReportScheduleInput) => void
    isSubmitting?: boolean
    submitLabel?: string
    /** Só a edição, dentro do modal, tem cancelar. */
    onCancel?: () => void
}

const FORMATS: readonly ReportFormat[] = ["PDF", "CSV"]

/**
 * Formulário "Geração automática" (LumiTrack Home v2.dc.html, Configurações →
 * Relatórios) — escopo, tipo, frequência, dia, destinatários, formato e se a
 * configuração está ativa. Serve à criação e, dentro do modal, à edição.
 *
 * O relatório mensal só existe com frequência mensal, então escolhê-lo fixa a
 * frequência. O dia muda de natureza conforme a frequência (nenhum, dia da
 * semana ou dia do mês).
 */
export const ReportScheduleForm = ({
    groups,
    initial,
    onSubmit,
    isSubmitting = false,
    submitLabel = "Salvar configuração",
    onCancel,
}: ReportScheduleFormProps) => {
    const { target, setTargetKey, state, setState, validationMessage, canSubmit } =
        useScheduleDraft(groups, initial)
    // Ids únicos por instância: o formulário aparece na página e, ao editar, também no modal.
    const uid = useId()
    const validationId = `${uid}-validation`

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (canSubmit) onSubmit(buildScheduleInput(state, target))
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <ScopeAndTypeFields
                groups={groups}
                targetKey={target.key}
                onTargetChange={setTargetKey}
                type={state.type}
                onTypeChange={(type) => setState(applyScheduleType(state, type))}
            />
            <FrequencyFields
                uid={uid}
                state={state}
                invalid={validationMessage !== null}
                onFrequencyChange={(frequency) =>
                    setState(applyScheduleFrequency(state, frequency))
                }
                onDayChange={(sendDay) => setState({ ...state, sendDay })}
            />
            <RecipientsField
                id={`${uid}-recipients`}
                value={state.recipients}
                describedBy={validationMessage ? validationId : undefined}
                invalid={validationMessage !== null}
                onChange={(recipients) => setState({ ...state, recipients })}
            />
            <FormatToggle
                uid={uid}
                value={state.format}
                onChange={(format) => setState({ ...state, format })}
            />
            <FormFooter
                validationId={validationId}
                validationMessage={validationMessage}
                active={state.active}
                onActiveChange={(active) => setState({ ...state, active })}
                canSubmit={canSubmit}
                isSubmitting={isSubmitting}
                submitLabel={submitLabel}
                onCancel={onCancel}
            />
        </form>
    )
}

// Rascunho local do formulário: o alvo escolhido e os demais campos.
function useScheduleDraft(groups: CompareTargetGroup[], initial: ReportSchedule | undefined) {
    const options = groups.flatMap((group) => group.options)
    const initialKey = initial ? `${initial.targetType}:${initial.targetId}` : undefined
    const [targetKey, setTargetKey] = useState(
        options.find((option) => option.key === initialKey)?.key ?? options[0]!.key,
    )
    const [state, setState] = useState<ScheduleFormState>(
        initial ? scheduleToFormState(initial) : INITIAL_SCHEDULE_FORM,
    )
    // A árvore pode ser recarregada com o alvo escolhido já inexistente: cai
    // para a primeira opção válida em vez de deixar o envio sem efeito.
    const target = options.find((option) => option.key === targetKey) ?? options[0]!

    const validationMessage = validateScheduleForm(state)
    const canSubmit = validationMessage === null && isScheduleFormFilled(state)

    return { target, setTargetKey, state, setState, validationMessage, canSubmit }
}

interface ScopeAndTypeFieldsProps {
    groups: CompareTargetGroup[]
    targetKey: string
    onTargetChange: (key: string) => void
    type: ReportType
    onTypeChange: (type: ReportType) => void
}

const ScopeAndTypeFields = ({
    groups,
    targetKey,
    onTargetChange,
    type,
    onTypeChange,
}: ScopeAndTypeFieldsProps) => (
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
            {REPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </Select>
    </>
)

interface FrequencyFieldsProps {
    uid: string
    state: ScheduleFormState
    invalid: boolean
    onFrequencyChange: (frequency: ReportFrequency) => void
    onDayChange: (sendDay: string) => void
}

const FrequencyFields = ({
    uid,
    state,
    invalid,
    onFrequencyChange,
    onDayChange,
}: FrequencyFieldsProps) => (
    <div className="grid grid-cols-2 gap-3">
        <Select
            label="Frequência"
            value={state.frequency}
            disabled={state.type === "MONTHLY"}
            helperText={
                state.type === "MONTHLY" ? "O relatório mensal é sempre mensal." : undefined
            }
            onChange={(event) => onFrequencyChange(event.target.value as ReportFrequency)}
        >
            {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </Select>
        <SendDayField
            uid={uid}
            frequency={state.frequency}
            value={state.sendDay}
            invalid={invalid}
            onChange={onDayChange}
        />
    </div>
)

interface SendDayFieldProps {
    uid: string
    frequency: ReportFrequency
    value: string
    invalid: boolean
    onChange: (value: string) => void
}

// O dia muda de natureza com a frequência: nenhum na diária, dia da semana na
// semanal e dia do mês nas demais (mês mais curto envia no último dia).
const SendDayField = ({ uid, frequency, value, invalid, onChange }: SendDayFieldProps) => {
    if (frequency === "DAILY") {
        return <p className="text-muted self-end pb-2 text-xs">Todo dia, às 06:00.</p>
    }
    if (frequency === "WEEKLY") {
        return (
            <Select label="Dia do envio" value={value} onChange={(e) => onChange(e.target.value)}>
                {WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </Select>
        )
    }
    return (
        <Input
            id={`${uid}-day`}
            type="number"
            min={1}
            max={31}
            label="Dia do envio"
            helperText="Em mês mais curto, sai no último dia."
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={invalid}
        />
    )
}

interface FormatToggleProps {
    uid: string
    value: ReportFormat
    onChange: (format: ReportFormat) => void
}

const FormatToggle = ({ uid, value, onChange }: FormatToggleProps) => (
    <div className="field">
        <span id={`${uid}-format-label`} className="text-text/70 text-xs">
            Formato
        </span>
        <div role="group" aria-labelledby={`${uid}-format-label`} className="mt-0.5 flex gap-1.5">
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
    validationId: string
    validationMessage: string | null
    active: boolean
    onActiveChange: (active: boolean) => void
    canSubmit: boolean
    isSubmitting: boolean
    submitLabel: string
    onCancel: (() => void) | undefined
}

const FormFooter = ({
    validationId,
    validationMessage,
    active,
    onActiveChange,
    canSubmit,
    isSubmitting,
    submitLabel,
    onCancel,
}: FormFooterProps) => (
    <div className="border-divider flex flex-col gap-3 border-t pt-4">
        {validationMessage && (
            <span id={validationId} role="alert" className="text-status-danger text-12-5">
                {validationMessage}
            </span>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Geração automática" className="flex gap-1.5">
                {[true, false].map((value) => (
                    <button
                        key={String(value)}
                        type="button"
                        className="lt-selbtn"
                        data-on={active === value}
                        aria-pressed={active === value}
                        onClick={() => onActiveChange(value)}
                    >
                        {value ? "Ativada" : "Desativada"}
                    </button>
                ))}
            </div>
            <div className="flex gap-2">
                {onCancel && (
                    <Button type="button" variant="secondary" onClick={onCancel}>
                        Cancelar
                    </Button>
                )}
                <Button
                    type="submit"
                    variant="primary"
                    disabled={!canSubmit}
                    isLoading={isSubmitting}
                >
                    {submitLabel}
                </Button>
            </div>
        </div>
    </div>
)

interface RecipientsFieldProps {
    id: string
    value: string
    describedBy: string | undefined
    invalid: boolean
    onChange: (value: string) => void
}

const RecipientsField = ({ id, value, describedBy, invalid, onChange }: RecipientsFieldProps) => (
    <Input
        id={id}
        label="Destinatários"
        placeholder="marina.souza@email.com, financeiro@email.com"
        helperText={`Separe por vírgula. No máximo ${MAX_RECIPIENTS}.`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
    />
)
