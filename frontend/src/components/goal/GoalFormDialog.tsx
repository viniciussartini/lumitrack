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
    applySpecificKwh,
    buildGoalCreateInput,
    buildGoalUpdateInput,
    goalToFormState,
    initialGoalForm,
    validateGoalForm,
    type GoalFormState,
} from "@/lib/goals"
import { extractErrorMessage } from "@/services/api"
import type { Goal } from "@/types/goal.types"

interface GoalFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    propertyId: string
    /** Presente na edição: preenche o rascunho com a meta salva. */
    goal: Goal | null
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
    goal,
    existingYears,
    currentYear,
}: GoalFormDialogProps) => (
    <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        kicker="Metas"
        title={goal ? "Editar meta de consumo" : "Nova meta de consumo"}
    >
        <GoalForm
            // O rascunho é estado local: remonta ao trocar de meta.
            key={goal?.id ?? "new"}
            propertyId={propertyId}
            goal={goal}
            existingYears={existingYears}
            currentYear={currentYear}
            onClose={() => onOpenChange(false)}
        />
    </FormDialog>
)

interface GoalFormProps {
    propertyId: string
    goal: Goal | null
    existingYears: readonly number[]
    currentYear: number
    onClose: () => void
}

const GoalForm = ({ propertyId, goal, existingYears, currentYear, onClose }: GoalFormProps) => {
    const uid = useId()
    const create = useCreateGoal()
    const update = useUpdateGoal()
    const [state, setState] = useState<GoalFormState>(
        goal ? goalToFormState(goal) : initialGoalForm(currentYear, existingYears),
    )
    const [showError, setShowError] = useState(false)

    const validationMessage = validateGoalForm(state, goal ? [] : existingYears)
    const validationId = `${uid}-validation`

    const handleError = (error: Error) =>
        toast.error("Não foi possível salvar a meta", { description: extractErrorMessage(error) })

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (validationMessage !== null) {
            setShowError(true)
            return
        }
        const options = { onSuccess: onClose, onError: handleError }
        if (goal) update.mutate({ id: goal.id, input: buildGoalUpdateInput(state) }, options)
        else create.mutate(buildGoalCreateInput(state, propertyId), options)
    }

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className="gap-18px pt-22px flex flex-col px-6 pb-6"
        >
            <IdentityFields state={state} onChange={setState} yearLocked={goal !== null} />
            <MonthFields
                months={state.months}
                onChange={(months) => setState({ ...state, months })}
            />

            <p className="text-muted text-13 leading-relaxed">
                O alerta de meta também aparece na página de alertas quando o percentual configurado
                for atingido.
            </p>

            {showError && validationMessage && (
                <p id={validationId} role="alert" className="text-status-danger text-sm">
                    {validationMessage}
                </p>
            )}

            <div className="border-divider pt-18px flex justify-end gap-3 border-t">
                <Button type="button" variant="secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button type="submit" isLoading={create.isPending || update.isPending}>
                    Salvar meta
                </Button>
            </div>
        </form>
    )
}

interface IdentityFieldsProps {
    state: GoalFormState
    onChange: (state: GoalFormState) => void
    /** O ano identifica a meta: para mudá-lo, exclui-se e cria-se outra. */
    yearLocked: boolean
}

const IdentityFields = ({ state, onChange, yearLocked }: IdentityFieldsProps) => (
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
            label="Consumo específico alvo · kWh"
            type="number"
            min={0}
            step={1}
            helperText="Repete o valor nos 12 meses."
            value={state.specificKwh}
            onChange={(event) => onChange(applySpecificKwh(state, event.target.value))}
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
    months: string[]
    onChange: (months: string[]) => void
}

const MonthFields = ({ months, onChange }: MonthFieldsProps) => (
    <fieldset>
        <legend className="font-heading text-muted border-divider text-10 w-full border-b pb-3 font-semibold tracking-[.07em] uppercase">
            Meta mês a mês · kWh
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
