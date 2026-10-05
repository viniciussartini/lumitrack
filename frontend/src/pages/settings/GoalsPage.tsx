import { useMemo, useState } from "react"
import { Link } from "react-router"
import { Target } from "lucide-react"
import { toast } from "sonner"
import { PropertySelector } from "@/components/dashboard/PropertySelector"
import { GoalFormDialog } from "@/components/goal/GoalFormDialog"
import { GoalHistoryTable } from "@/components/goal/GoalHistoryTable"
import { GoalProgressSection } from "@/components/goal/GoalProgressSection"
import { GoalSummaryCard } from "@/components/goal/GoalSummaryCard"
import { GoalUnitSelector } from "@/components/goal/GoalUnitSelector"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { EmptyState } from "@/components/ui/EmptyState"
import { useDeleteGoal, useGoalProgress, useGoals } from "@/hooks/queries/useGoals"
import { useProperties } from "@/hooks/queries/useProperties"
import { usePropertySelection } from "@/hooks/usePropertySelection"
import {
    availableGoalUnits,
    currentGoalMonthIndex,
    currentGoalYear,
    referenceGoalForm,
} from "@/lib/goals"
import { extractErrorMessage } from "@/services/api"
import type { Goal, GoalProgress, GoalUnit } from "@/types/goal.types"
import { MAX_PAGE_SIZE } from "@/types/pagination.types"

type DialogState =
    { kind: "create" } | { kind: "edit"; goal: Goal } | { kind: "reference"; goal: Goal } | null

/**
 * Configurações → Metas (LumiTrack Home v2.dc.html) — metas anuais de consumo
 * da propriedade selecionada: card da meta do ano corrente e histórico, com
 * criar, editar e excluir. A propriedade é a mesma escolhida no Painel.
 */
export const GoalsPage = () => {
    const propertiesQuery = useProperties(1, MAX_PAGE_SIZE)
    const properties = propertiesQuery.data?.items
    const { selectedId, selectedProperty, selectProperty } = usePropertySelection(properties)
    const [chosenUnit, setUnit] = useState<GoalUnit>("KWH")
    // A demanda só existe no Grupo A: ao trocar para uma propriedade que não a
    // tem, a página volta ao consumo sem precisar de efeito.
    const units = availableGoalUnits(selectedProperty?.tariffGroup)
    const unit = units.includes(chosenUnit) ? chosenUnit : "KWH"

    if (propertiesQuery.isPending) {
        return (
            <p role="status" className="text-muted p-10 text-center text-sm">
                Carregando...
            </p>
        )
    }

    if (propertiesQuery.isError) {
        return (
            <p role="alert" className="text-status-danger p-10 text-center text-sm">
                Não foi possível carregar suas propriedades.
            </p>
        )
    }

    if (!properties || properties.length === 0 || selectedId === null) {
        return (
            <EmptyState
                icon={Target}
                title="Nenhuma propriedade cadastrada"
                description="Cadastre uma propriedade para definir metas de consumo e de custo."
                action={
                    <Link to="/configuracoes/cadastro" className="btn btn-primary">
                        Ir para o cadastro
                    </Link>
                }
            />
        )
    }

    return (
        <div className="flex flex-col gap-[clamp(16px,2vw,20px)]">
            {properties.length > 1 && (
                <PropertySelector
                    properties={properties}
                    selectedId={selectedId}
                    onChange={selectProperty}
                />
            )}
            <GoalUnitSelector unit={unit} units={units} onChange={setUnit} />
            <PropertyGoals propertyId={selectedId} unit={unit} />
        </div>
    )
}

const PropertyGoals = ({ propertyId, unit }: { propertyId: string; unit: GoalUnit }) => {
    const goalsQuery = useGoals(propertyId)
    const progressQuery = useGoalProgress(propertyId)
    const progressByGoalId = useMemo(
        () => new Map((progressQuery.data ?? []).map((item) => [item.goalId, item])),
        [progressQuery.data],
    )

    if (goalsQuery.isPending) {
        return (
            <p role="status" className="text-muted p-10 text-center text-sm">
                Carregando...
            </p>
        )
    }

    if (goalsQuery.isError) {
        return (
            <p role="alert" className="text-status-danger p-10 text-center text-sm">
                Não foi possível carregar as metas.
            </p>
        )
    }

    return (
        <GoalsContent
            propertyId={propertyId}
            unit={unit}
            goals={goalsQuery.data.items}
            progressByGoalId={progressByGoalId}
            progressStatus={{ isPending: progressQuery.isPending, isError: progressQuery.isError }}
        />
    )
}

interface GoalsContentProps {
    propertyId: string
    /** Unidade mostrada: a lista e as ações valem só para ela. */
    unit: GoalUnit
    goals: Goal[]
    progressByGoalId: ReadonlyMap<string, GoalProgress>
    progressStatus: { isPending: boolean; isError: boolean }
}

const GoalsContent = ({
    propertyId,
    unit,
    goals: allGoals,
    progressByGoalId,
    progressStatus,
}: GoalsContentProps) => {
    const [dialog, setDialog] = useState<DialogState>(null)
    const [deleting, setDeleting] = useState<Goal | null>(null)
    const now = new Date()
    const currentYear = currentGoalYear(now)
    const monthIndex = currentGoalMonthIndex(now)
    // As metas das duas unidades chegam juntas; a tela mostra uma por vez.
    const goals = allGoals.filter((goal) => goal.unit === unit)
    const currentGoal = goals.find((goal) => goal.year === currentYear)
    const existingYears = goals.map((goal) => goal.year)

    return (
        <>
            <GoalSummaryCard
                currentGoal={currentGoal}
                currentYear={currentYear}
                monthIndex={monthIndex}
                unit={unit}
                onNewGoal={() => setDialog({ kind: "create" })}
            />
            {currentGoal && (
                <ProgressBlock
                    isPending={progressStatus.isPending}
                    isError={progressStatus.isError}
                    progress={progressByGoalId.get(currentGoal.id)}
                    monthIndex={monthIndex}
                />
            )}
            <GoalHistoryTable
                goals={goals}
                progressByGoalId={progressByGoalId}
                currentYear={currentYear}
                onEdit={(goal) => setDialog({ kind: "edit", goal })}
                onDelete={setDeleting}
                onUseAsReference={(goal) => setDialog({ kind: "reference", goal })}
            />

            <GoalFormHost
                dialog={dialog}
                onClose={() => setDialog(null)}
                propertyId={propertyId}
                unit={unit}
                progressByGoalId={progressByGoalId}
                existingYears={existingYears}
                currentYear={currentYear}
            />
            <DeleteGoalDialog goal={deleting} onClose={() => setDeleting(null)} />
        </>
    )
}

interface GoalFormHostProps {
    dialog: DialogState
    onClose: () => void
    propertyId: string
    unit: GoalUnit
    progressByGoalId: ReadonlyMap<string, GoalProgress>
    existingYears: readonly number[]
    currentYear: number
}

// O modal de meta: nova, edição ou nova a partir de um ano de referência, que
// já chega preenchida com o realizado daquele ano.
const GoalFormHost = ({
    dialog,
    onClose,
    propertyId,
    unit,
    progressByGoalId,
    existingYears,
    currentYear,
}: GoalFormHostProps) => (
    <GoalFormDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && onClose()}
        propertyId={propertyId}
        unit={unit}
        goal={dialog?.kind === "edit" ? dialog.goal : null}
        initial={
            dialog?.kind === "reference"
                ? referenceGoalForm(
                      dialog.goal,
                      progressByGoalId.get(dialog.goal.id),
                      currentYear,
                      existingYears,
                  )
                : undefined
        }
        existingYears={existingYears}
        currentYear={currentYear}
    />
)

interface ProgressBlockProps {
    isPending: boolean
    isError: boolean
    progress: GoalProgress | undefined
    monthIndex: number
}

// O acompanhamento é um complemento: se falhar, a lista de metas segue usável.
const ProgressBlock = ({ isPending, isError, progress, monthIndex }: ProgressBlockProps) => {
    if (isPending) {
        return (
            <p role="status" className="text-muted p-5 text-center text-sm">
                Carregando o acompanhamento...
            </p>
        )
    }
    if (isError) {
        return (
            <p role="alert" className="text-status-danger p-5 text-center text-sm">
                Não foi possível carregar o acompanhamento das metas.
            </p>
        )
    }
    return progress ? <GoalProgressSection progress={progress} monthIndex={monthIndex} /> : null
}

interface DeleteGoalDialogProps {
    goal: Goal | null
    onClose: () => void
}

const DeleteGoalDialog = ({ goal, onClose }: DeleteGoalDialogProps) => {
    const remove = useDeleteGoal()

    const confirm = () => {
        if (!goal) return
        remove.mutate(goal.id, {
            onSuccess: onClose,
            onError: (error) => {
                onClose()
                toast.error("Não foi possível excluir a meta", {
                    description: extractErrorMessage(error),
                })
            },
        })
    }

    return (
        <ConfirmDialog
            open={goal !== null}
            onOpenChange={(open) => !open && onClose()}
            title="Excluir meta"
            description={
                goal ? `A meta de ${goal.year} será removida. Esta ação não pode ser desfeita.` : ""
            }
            confirmLabel="Excluir"
            isLoading={remove.isPending}
            onConfirm={confirm}
        />
    )
}
