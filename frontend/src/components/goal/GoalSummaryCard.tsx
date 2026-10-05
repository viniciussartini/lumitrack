import { Plus } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { describeCurrentGoal, goalUnitLabels } from "@/lib/goals"
import type { Goal, GoalUnit } from "@/types/goal.types"

interface GoalSummaryCardProps {
    /** Meta do ano corrente, quando existe. */
    currentGoal: Goal | undefined
    currentYear: number
    monthIndex: number
    /** Unidade das metas mostradas: define o título e o texto de "sem meta". */
    unit: GoalUnit
    onNewGoal: () => void
}

/**
 * Card das metas anuais (LumiTrack Home v2.dc.html, Configurações → Metas):
 * a meta do ano corrente, na unidade escolhida, em uma frase e o botão "Nova meta".
 */
export const GoalSummaryCard = ({
    currentGoal,
    currentYear,
    monthIndex,
    unit,
    onNewGoal,
}: GoalSummaryCardProps) => (
    <Blueprint className="p-0" data-testid="goal-summary">
        <div className="py-18px flex flex-wrap items-start justify-between gap-4 px-5">
            <div className="min-w-0">
                <span className="font-heading text-17 font-semibold uppercase">
                    {goalUnitLabels(unit).cardTitle}
                </span>
                <span className="text-muted text-13 mt-1.5 block leading-relaxed">
                    {currentGoal
                        ? describeCurrentGoal(currentGoal, monthIndex)
                        : goalUnitLabels(unit).empty(currentYear)}
                </span>
            </div>
            <Button
                type="button"
                className="shrink-0 gap-2"
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                onClick={onNewGoal}
            >
                Nova meta
            </Button>
        </div>
    </Blueprint>
)
