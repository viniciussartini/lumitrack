import { useId, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
import { FormDialog } from "@/components/ui/FormDialog"
import { Input } from "@/components/ui/Input"
import { useCreateGoal, useUpdateGoal } from "@/hooks/queries/useGoals"
import {
    MAX_ALERT_PERCENT,
    MAX_GOAL_YEAR,
    MIN_ALERT_PERCENT,
    MIN_GOAL_YEAR,
    MONTH_LABELS,
    applySpecificValue,
    buildGoalCreateInput,
    buildGoalUpdateInput,
    goalToFormState,
    goalUnitLabels,
    initialGoalForm,
    validateGoalForm,
    type GoalFormState,
} from "@/lib/goals"
import { extractErrorMessage } from "@/services/api"
import type { Goal, GoalUnit } from "@/types/goal.types"

interface GoalFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    propertyId: string
    /** Unidade da meta nova; na edição vale a da própria meta. */
    unit: GoalUnit
    /** Presente na edição: preenche o rascunho com a meta salva. */
    goal: Goal | null
    /** Rascunho de partida de uma meta nova (ex.: montada a partir de um ano de referência). */
    initial?: GoalFormState
    /** Anos em que a propriedade já tem meta; a criação não repete nenhum. */
    existingYears: readonly number[]
    currentYear: number
}

/**
 * Modal "Nova meta de consumo" / "Editar meta de consumo" (LumiTrack Home
 * v2.dc.html, Configurações → Metas): ano da meta, ano de referência, consumo
 * específico alvo, percentual de alerta e a meta de cada mês.
 */
export const GoalFormDialog = ({
    open,
    onOpenChange,
    propertyId,
    unit,
    goal,
    initial,
    existingYears,
    currentYear,
}: GoalFormDialogProps) => (
    <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        kicker="Metas"
        title={goal ? goalUnitLabels(goal.unit).editTitle : goalUnitLabels(unit).newTitle}
    >
        <GoalForm
            // O rascunho é estado local: remonta ao trocar de meta.
            key={goal?.id ?? (initial ? "reference" : "new")}
            propertyId={propertyId}
            unit={goal?.unit ?? unit}
            goal={goal}
            initial={initial}
            existingYears={existingYears}
            currentYear={currentYear}
            onClose={() => onOpenChange(false)}
        />
    </FormDialog>
)

interface GoalFormProps {
    propertyId: string
    unit: GoalUnit
    goal: Goal | null
    initial: GoalFormState | undefined
    existingYears: readonly number[]
    currentYear: number
    onClose: () => void
}

const GoalForm = ({
    propertyId,
    unit,
    goal,
    initial,
    existingYears,
    currentYear,
    onClose,
}: GoalFormProps) => {
    const uid = useId()
    const { submit, isPending } = useGoalSubmit({ propertyId, unit, goal, onClose })
    const [state, setState] = useState<GoalFormState>(
        goal ? goalToFormState(goal) : (initial ?? initialGoalForm(currentYear, existingYears)),
    )
    const [showError, setShowError] = useState(false)

    const validationMessage = validateGoalForm(state, goal ? [] : existingYears)
    const validationId = `${uid}-validation`

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (validationMessage !== null) {
            setShowError(true)
            return
        }
        submit(state)
    }

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className="gap-18px pt-22px flex flex-col px-6 pb-6"
        >
            <IdentityFields
                state={state}
                onChange={setState}
                yearLocked={goal !== null}
                unit={unit}
            />
            <MonthFields
                unit={unit}
                months={state.months}
                onChange={(months) => setState({ ...state, months })}
            />

            <p className="text-muted text-13 leading-relaxed">
                O alerta de meta também aparece na página de alertas quando o percentual configurado
                for atingido.
            </p>

            <FormFooter
                errorId={validationId}
                error={showError ? validationMessage : null}
                isPending={isPending}
                onCancel={onClose}
            />
        </form>
    )
}

interface FormFooterProps {
    errorId: string
    /** Mensagem de validação a mostrar; nula enquanto o usuário não tentou salvar. */
    error: string | null
    isPending: boolean
    onCancel: () => void
}

const FormFooter = ({ errorId, error, isPending, onCancel }: FormFooterProps) => (
    <>
        {error && (
            <p id={errorId} role="alert" className="text-status-danger text-sm">
                {error}
            </p>
        )}
        <div className="border-divider pt-18px flex justify-end gap-3 border-t">
            <Button type="button" variant="secondary" onClick={onCancel}>
                Cancelar
            </Button>
            <Button type="submit" isLoading={isPending}>
                Salvar meta
            </Button>
        </div>
    </>
)

interface GoalSubmitOptions {
    propertyId: string
    unit: GoalUnit
    goal: Goal | null
    onClose: () => void
}

// Cria ou edita conforme haja meta de partida; o erro do servidor vira aviso e
// o modal segue aberto.
const useGoalSubmit = ({ propertyId, unit, goal, onClose }: GoalSubmitOptions) => {
    const create = useCreateGoal()
    const update = useUpdateGoal()

    const submit = (state: GoalFormState) => {
        const options = {
            onSuccess: onClose,
            onError: (error: Error) =>
                toast.error("Não foi possível salvar a meta", {
                    description: extractErrorMessage(error),
                }),
        }
        if (goal) update.mutate({ id: goal.id, input: buildGoalUpdateInput(state) }, options)
        else create.mutate(buildGoalCreateInput(state, propertyId, unit), options)
    }

    return { submit, isPending: create.isPending || update.isPending }
}

interface IdentityFieldsProps {
    state: GoalFormState
    onChange: (state: GoalFormState) => void
    /** O ano identifica a meta: para mudá-lo, exclui-se e cria-se outra. */
    yearLocked: boolean
    unit: GoalUnit
}

const IdentityFields = ({ state, onChange, yearLocked, unit }: IdentityFieldsProps) => (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-4">
        <Input
            label="Ano da meta"
            type="number"
            min={MIN_GOAL_YEAR}
            max={MAX_GOAL_YEAR}
            step={1}
            disabled={yearLocked}
            value={state.year}
            onChange={(event) => onChange({ ...state, year: event.target.value })}
        />
        <Input
            label="Ano de referência"
            type="number"
            min={MIN_GOAL_YEAR}
            max={MAX_GOAL_YEAR}
            step={1}
            value={state.referenceYear}
            onChange={(event) => onChange({ ...state, referenceYear: event.target.value })}
        />
        <Input
            label={goalUnitLabels(unit).specific}
            type="number"
            min={0}
            step={1}
            helperText="Repete o valor nos 12 meses."
            value={state.specificValue}
            onChange={(event) => onChange(applySpecificValue(state, event.target.value))}
        />
        <Input
            label="Alerta ao atingir · %"
            type="number"
            min={MIN_ALERT_PERCENT}
            max={MAX_ALERT_PERCENT}
            step={5}
            value={state.alertPercent}
            onChange={(event) => onChange({ ...state, alertPercent: event.target.value })}
        />
    </div>
)

interface MonthFieldsProps {
    unit: GoalUnit
    months: string[]
    onChange: (months: string[]) => void
}

const MonthFields = ({ unit, months, onChange }: MonthFieldsProps) => (
    <fieldset>
        <legend className="font-heading text-muted border-divider text-10 w-full border-b pb-3 font-semibold tracking-[.07em] uppercase">
            {goalUnitLabels(unit).months}
        </legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3 pt-4">
            {MONTH_LABELS.map((label, index) => (
                <Input
                    key={label}
                    label={label}
                    type="number"
                    min={0}
                    step={1}
                    value={months[index] ?? ""}
                    onChange={(event) =>
                        onChange(months.map((m, i) => (i === index ? event.target.value : m)))
                    }
                />
            ))}
        </div>
    </fieldset>
)
