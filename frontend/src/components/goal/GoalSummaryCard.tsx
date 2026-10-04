import { Plus } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { describeCurrentGoal } from "@/lib/goals"
import type { Goal } from "@/types/goal.types"

interface GoalSummaryCardProps {
    /** Meta do ano corrente, quando existe. */
    currentGoal: Goal | undefined
    currentYear: number
    monthIndex: number
    onNewGoal: () => void
}

/**
 * Card "Metas de consumo anual" (LumiTrack Home v2.dc.html, Configurações →
 * Metas): a meta do ano corrente em uma frase e o botão "Nova meta".
 */
export const GoalSummaryCard = ({
    currentGoal,
    currentYear,
    monthIndex,
    onNewGoal,
}: GoalSummaryCardProps) => (
    <Blueprint className="p-0" data-testid="goal-summary">
        <div className="py-18px flex flex-wrap items-start justify-between gap-4 px-5">
            <div className="min-w-0">
                <span className="font-heading text-17 font-semibold uppercase">
                    Metas de consumo anual
                </span>
                <span className="text-muted text-13 mt-1.5 block leading-relaxed">
                    {currentGoal
                        ? describeCurrentGoal(currentGoal, monthIndex)
                        : `Nenhuma meta cadastrada para ${currentYear}.`}
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
