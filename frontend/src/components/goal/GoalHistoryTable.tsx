import { Pencil, Trash2 } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import {
    GOAL_TONE_DOT_CLASS,
    GOAL_TONE_TEXT_CLASS,
    deviationTone,
    describeSituation,
    formatDeviation,
    formatKwh,
    formatRealized,
    goalYearlyKwh,
    isGoalLocked,
} from "@/lib/goals"
import { cn } from "@/lib/cn"
import type { Goal, GoalProgress } from "@/types/goal.types"

interface GoalHistoryTableProps {
    goals: Goal[]
    /** Acompanhamento por id da meta; ausente enquanto carrega ou se falhou. */
    progressByGoalId: ReadonlyMap<string, GoalProgress>
    currentYear: number
    onEdit: (goal: Goal) => void
    onDelete: (goal: Goal) => void
}

/**
 * Bloco "Histórico de metas" (LumiTrack Home v2.dc.html, Configurações →
 * Metas): uma linha por ano, do mais recente ao mais antigo. Só o ano
 * corrente e os futuros oferecem editar e excluir — anos passados ficam
 * como base de referência.
 */
export const GoalHistoryTable = ({
    goals,
    progressByGoalId,
    currentYear,
    onEdit,
    onDelete,
}: GoalHistoryTableProps) => (
    <Blueprint className="p-0" data-testid="goal-history">
        <div className="border-divider border-b px-5 py-4">
            <span className="font-heading text-17 font-semibold uppercase">Histórico de metas</span>
            <span className="text-muted text-12-5 mt-1 block">
                Metas de anos anteriores não podem ser alteradas nem excluídas; servem de base de
                referência.
            </span>
        </div>

        {goals.length === 0 ? (
            <p data-testid="goal-history-empty" className="text-muted p-8 text-center text-sm">
                Nenhuma meta cadastrada.
            </p>
        ) : (
            <div className="overflow-x-auto">
                <table className="table min-w-241">
                    <thead>
                        <tr>
                            <th scope="col">Ano</th>
                            <th scope="col" className="text-right">
                                Meta
                            </th>
                            <th scope="col" className="text-right">
                                Realizado
                            </th>
                            <th scope="col" className="text-right">
                                Desvio
                            </th>
                            <th scope="col">Base de referência</th>
                            <th scope="col">Situação</th>
                            <th scope="col" className="text-right">
                                <span className="sr-only">Ações</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {goals.map((goal) => (
                            <GoalRow
                                key={goal.id}
                                goal={goal}
                                progress={progressByGoalId.get(goal.id)}
                                currentYear={currentYear}
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </Blueprint>
)

interface GoalRowProps {
    goal: Goal
    progress: GoalProgress | undefined
    currentYear: number
    onEdit: (goal: Goal) => void
    onDelete: (goal: Goal) => void
}

const GoalRow = ({ goal, progress, currentYear, onEdit, onDelete }: GoalRowProps) => {
    const locked = isGoalLocked(goal, currentYear)
    const situation = describeSituation(progress?.situation)
    const deviation = progress?.deviationPercent

    return (
        <tr data-testid={`goal-row-${goal.year}`}>
            <td className="font-heading text-base font-semibold">{goal.year}</td>
            <td className="text-right">{formatKwh(goalYearlyKwh(goal))}</td>
            <td className="text-right">{formatRealized(progress)}</td>
            <td className={cn("text-right", GOAL_TONE_TEXT_CLASS[deviationTone(deviation)])}>
                {formatDeviation(deviation)}
            </td>
            <td>Ano {goal.referenceYear}</td>
            <td>
                <span className="text-13 inline-flex items-center gap-2">
                    {situation.tone !== "muted" && (
                        <span
                            aria-hidden="true"
                            className={cn(
                                "h-2 w-2 rounded-full",
                                GOAL_TONE_DOT_CLASS[situation.tone],
                            )}
                        />
                    )}
                    {situation.label}
                </span>
            </td>
            <td>
                <div className="flex justify-end gap-1.5">
                    {!locked && (
                        <>
                            <button
                                type="button"
                                className="lt-iconbtn"
                                title="Editar meta"
                                aria-label={`Editar meta de ${goal.year}`}
                                onClick={() => onEdit(goal)}
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="lt-iconbtn"
                                title="Excluir meta"
                                aria-label={`Excluir meta de ${goal.year}`}
                                onClick={() => onDelete(goal)}
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </>
                    )}
                </div>
            </td>
        </tr>
    )
}
