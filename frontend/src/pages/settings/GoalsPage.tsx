import { useMemo, useState } from "react"
import { Link } from "react-router"
import { Target } from "lucide-react"
import { toast } from "sonner"
import { PropertySelector } from "@/components/dashboard/PropertySelector"
import { GoalFormDialog } from "@/components/goal/GoalFormDialog"
import { GoalHistoryTable } from "@/components/goal/GoalHistoryTable"
import { GoalProgressSection } from "@/components/goal/GoalProgressSection"
import { GoalSummaryCard } from "@/components/goal/GoalSummaryCard"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { EmptyState } from "@/components/ui/EmptyState"
import { useDeleteGoal, useGoalProgress, useGoals } from "@/hooks/queries/useGoals"
import { useProperties } from "@/hooks/queries/useProperties"
import { usePropertySelection } from "@/hooks/usePropertySelection"
import { currentGoalMonthIndex, currentGoalYear } from "@/lib/goals"
import { extractErrorMessage } from "@/services/api"
import type { Goal, GoalProgress } from "@/types/goal.types"
import { MAX_PAGE_SIZE } from "@/types/pagination.types"

type DialogState = { kind: "create" } | { kind: "edit"; goal: Goal } | null

/**
 * Configurações → Metas (LumiTrack Home v2.dc.html) — metas anuais de consumo
 * da propriedade selecionada: card da meta do ano corrente e histórico, com
 * criar, editar e excluir. A propriedade é a mesma escolhida no Painel.
 */
export const GoalsPage = () => {
    const propertiesQuery = useProperties(1, MAX_PAGE_SIZE)
    const properties = propertiesQuery.data?.items
    const { selectedId, selectProperty } = usePropertySelection(properties)

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
                description="Cadastre uma propriedade para definir metas de consumo."
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
            <PropertyGoals propertyId={selectedId} />
        </div>
    )
}

const PropertyGoals = ({ propertyId }: { propertyId: string }) => {
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
            goals={goalsQuery.data.items}
            progressByGoalId={progressByGoalId}
            progressStatus={{ isPending: progressQuery.isPending, isError: progressQuery.isError }}
        />
    )
}

interface GoalsContentProps {
    propertyId: string
    goals: Goal[]
    progressByGoalId: ReadonlyMap<string, GoalProgress>
    progressStatus: { isPending: boolean; isError: boolean }
}

const GoalsContent = ({
    propertyId,
    goals,
    progressByGoalId,
    progressStatus,
}: GoalsContentProps) => {
    const [dialog, setDialog] = useState<DialogState>(null)
    const [deleting, setDeleting] = useState<Goal | null>(null)
    const now = new Date()
    const currentYear = currentGoalYear(now)
    const monthIndex = currentGoalMonthIndex(now)
    const currentGoal = goals.find((goal) => goal.year === currentYear)

    return (
        <>
            <GoalSummaryCard
                currentGoal={currentGoal}
                currentYear={currentYear}
                monthIndex={monthIndex}
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
            />

            <GoalFormDialog
                open={dialog !== null}
                onOpenChange={(open) => !open && setDialog(null)}
                propertyId={propertyId}
                goal={dialog?.kind === "edit" ? dialog.goal : null}
                existingYears={goals.map((goal) => goal.year)}
                currentYear={currentYear}
            />
            <DeleteGoalDialog goal={deleting} onClose={() => setDeleting(null)} />
        </>
    )
}

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
