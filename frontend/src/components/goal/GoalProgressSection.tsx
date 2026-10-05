import { Blueprint } from "@/components/ui/Blueprint"
import {
    GoalProgressChart,
    REALIZED_COLOR,
    TARGET_COLOR,
} from "@/components/goal/GoalProgressChart"
import {
    GOAL_TONE_TEXT_CLASS,
    MONTH_NAMES,
    deviationTone,
    formatDeviation,
    formatGoalValue,
    goalUnitLabels,
    type GoalTone,
} from "@/lib/goals"
import { cn } from "@/lib/cn"
import type { GoalProgress } from "@/types/goal.types"

interface GoalProgressSectionProps {
    progress: GoalProgress
    /** Mês corrente, de 0 (janeiro) a 11 (dezembro). */
    monthIndex: number
}

/**
 * Bloco "{ano} · meta vs. realizado" (LumiTrack Home v2.dc.html, Configurações
 * → Metas): o gráfico de barras e os cards Meta do ano, Realizado até o mês
 * corrente, Desvio acumulado e a meta do mês.
 */
export const GoalProgressSection = ({ progress, monthIndex }: GoalProgressSectionProps) => (
    <Blueprint className="p-0" data-testid="goal-progress">
        <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <span className="font-heading text-17 font-semibold uppercase">
                {progress.year} · meta vs. realizado
            </span>
            <ul className="m-0 flex list-none flex-wrap gap-4 p-0">
                <LegendItem color={TARGET_COLOR} label="Meta do mês" />
                <LegendItem color={REALIZED_COLOR} label="Realizado" />
            </ul>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-stretch">
            <div className="min-w-0 p-5">
                <GoalProgressChart months={progress.months} unit={progress.unit} />
            </div>
            <dl className="border-divider m-0 grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] content-start border-l">
                <Stat
                    label={`Meta de ${progress.year}`}
                    value={formatGoalValue(progress.yearTarget, progress.unit)}
                />
                <Stat
                    label={`Realizado até ${MONTH_NAMES[monthIndex] ?? ""}`}
                    value={
                        progress.realized === null
                            ? "-"
                            : formatGoalValue(progress.realized, progress.unit)
                    }
                />
                <Stat
                    label="Desvio acumulado"
                    value={formatDeviation(progress.deviationPercent)}
                    tone={deviationTone(progress.deviationPercent)}
                />
                <Stat
                    label={goalUnitLabels(progress.unit).monthStat}
                    value={
                        progress.currentMonthTarget === null
                            ? "-"
                            : formatGoalValue(progress.currentMonthTarget, progress.unit)
                    }
                />
            </dl>
        </div>
    </Blueprint>
)

interface LegendItemProps {
    color: string
    label: string
}

const LegendItem = ({ color, label }: LegendItemProps) => (
    <li className="text-12 inline-flex items-center gap-2">
        <span aria-hidden="true" className="h-3 w-3" style={{ backgroundColor: color }} />
        {label}
    </li>
)

interface StatProps {
    label: string
    value: string
    tone?: GoalTone
}

const Stat = ({ label, value, tone }: StatProps) => (
    <div className="border-divider py-18px border-b px-5">
        <dt className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
            {label}
        </dt>
        <dd
            className={cn(
                "font-heading text-26 m-0 mt-2 leading-none font-semibold",
                tone && GOAL_TONE_TEXT_CLASS[tone],
            )}
        >
            {value}
        </dd>
    </div>
)
