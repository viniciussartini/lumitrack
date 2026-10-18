import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { SectionStat } from "@/components/dashboard/SectionParts"
import { SectionError, SectionSkeleton } from "@/components/ui/SectionState"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { GoalPaceChart, type PacePeriod } from "@/components/dashboard/GoalPaceChart"
import { REALIZED_COLOR, TARGET_COLOR } from "@/components/goal/GoalProgressChart"
import { useConsumption } from "@/hooks/queries/useConsumption"
import { useGoalProgress } from "@/hooks/queries/useGoals"
import { useMeterByTarget } from "@/hooks/queries/useMeters"
import { daysInMonth } from "@/lib/dashboardKpis"
import { resolveMonthlyHistoryWindow } from "@/lib/consumptionWindow"
import {
    buildMonthPace,
    buildYearPace,
    dailyValuesFromBuckets,
    type Pace,
    type PaceUnit,
} from "@/lib/goalPace"
import {
    MONTH_LABELS,
    currentGoalMonthIndex,
    currentGoalYear,
    deviationTone,
    formatDeviation,
    formatGoalValue,
    goalUnitLabels,
    type GoalTone,
} from "@/lib/goals"
import type { ConsumptionBucket } from "@/types/consumption.types"
import type { GoalProgress } from "@/types/goal.types"

interface GoalSectionProps {
    propertyId: string
    propertyName: string
    /** Faixa no rodapé do bloco (a do horário de ponta no Grupo A), com ou sem meta cadastrada. */
    footer?: ReactNode
}

/** Teto do backend (`paginationQuerySchema`): cobre todos os dias de um mês de 31 dias. */
const DAILY_PAGE_SIZE = 31

const PERIOD_OPTIONS: readonly { value: PacePeriod; label: string }[] = [
    { value: "month", label: "Mês" },
    { value: "year", label: "Ano" },
]

const UNIT_OPTIONS: readonly { value: PaceUnit; label: string }[] = [
    { value: "KWH", label: "kWh" },
    { value: "BRL", label: "R$" },
]

/**
 * "Meta de consumo" do Painel (LumiTrack Home v2.dc.html, Painel): a meta da
 * propriedade selecionada, com alternância Mês | Ano e kWh | R$, os cards de
 * meta, acumulado, projeção de fechamento e situação, e o gráfico do acumulado
 * contra o ritmo da meta.
 *
 * O Ano vem de `GET /api/goals/progress`, que já calcula o realizado de cada
 * mês. O Mês soma o consumo diário (`GET /api/consumption`, bucket dia) dos
 * dias já fechados — hoje fica de fora por estar incompleto, a mesma janela do
 * histórico de consumo, que compartilha o cache. Em R$ essa soma é só a parte
 * variável do custo (energia, bandeira e tributos): o custo diário não traz
 * piso, iluminação pública nem demanda, então a página de Metas, que conta o mês
 * cheio, mostra um número maior. A nota do bloco diz isso.
 *
 * Dia ou mês sem leitura aparece como "-" e fica fora do acumulado.
 */
export const GoalSection = ({ propertyId, propertyName, footer }: GoalSectionProps) => {
    const [period, setPeriod] = useState<PacePeriod>("month")
    const [unit, setUnit] = useState<PaceUnit>("KWH")

    return (
        <Blueprint className="p-0" data-testid="goal-section">
            <GoalHeader
                propertyId={propertyId}
                propertyName={propertyName}
                period={period}
                onPeriodChange={setPeriod}
                unit={unit}
                onUnitChange={setUnit}
            />
            <GoalBody propertyId={propertyId} period={period} unit={unit} />
            {footer}
        </Blueprint>
    )
}

const goalsPath = (propertyId: string): string =>
    `/configuracoes/metas?propertyId=${encodeURIComponent(propertyId)}`

interface GoalHeaderProps {
    propertyId: string
    propertyName: string
    period: PacePeriod
    onPeriodChange: (next: PacePeriod) => void
    unit: PaceUnit
    onUnitChange: (next: PaceUnit) => void
}

const GoalHeader = ({
    propertyId,
    propertyName,
    period,
    onPeriodChange,
    unit,
    onUnitChange,
}: GoalHeaderProps) => (
    <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
            <span className="font-heading text-17 font-semibold uppercase">Meta de consumo</span>
            <span className="text-muted text-12-5 mt-0.5 block">
                {propertyName} · acumulado {period === "month" ? "do mês" : "do ano"} contra o ritmo
                da meta
            </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
            <Toggle
                label="Período da meta"
                options={PERIOD_OPTIONS}
                value={period}
                onChange={onPeriodChange}
                testIdPrefix="goal-period"
            />
            <Toggle
                label="Unidade da meta"
                options={UNIT_OPTIONS}
                value={unit}
                onChange={onUnitChange}
                testIdPrefix="goal-unit"
            />
            <ul className="m-0 flex list-none flex-wrap gap-4 p-0">
                <LegendItem color={REALIZED_COLOR} label="Acumulado" />
                <LegendItem color={TARGET_COLOR} label="Meta acumulada" dashed />
            </ul>
            <Link
                to={goalsPath(propertyId)}
                className="font-heading text-accent-700 text-11 font-semibold tracking-[.05em] uppercase hover:underline"
            >
                Configurar meta
            </Link>
        </div>
    </div>
)

interface GoalBodyProps {
    propertyId: string
    period: PacePeriod
    unit: PaceUnit
}

/** Estados do acompanhamento da meta (carregando, erro, sem meta) e, com meta, o período escolhido. */
const GoalBody = ({ propertyId, period, unit }: GoalBodyProps) => {
    const now = new Date()
    const year = currentGoalYear(now)
    const progressQuery = useGoalProgress(propertyId)

    if (progressQuery.isLoading)
        return <SectionSkeleton label="Carregando meta de consumo" testId="goal-skeleton" />

    if (progressQuery.isError) {
        return (
            <SectionError
                message={
                    progressQuery.error instanceof Error
                        ? progressQuery.error.message
                        : "Não foi possível carregar a meta."
                }
                onRetry={() => void progressQuery.refetch()}
            />
        )
    }

    // A unidade sem meta no ano corrente mostra o vazio dela; a outra unidade segue acessível no toggle.
    const goal = progressQuery.data?.find((item) => item.year === year && item.unit === unit)
    if (!goal) {
        return (
            <GoalEmpty
                message={goalUnitLabels(unit).empty(year)}
                action={
                    <Button asChild variant="secondary">
                        <Link to={goalsPath(propertyId)}>Criar meta</Link>
                    </Button>
                }
            />
        )
    }

    return period === "year" ? (
        <YearBody goal={goal} unit={unit} monthIndex={currentGoalMonthIndex(now)} />
    ) : (
        <MonthBody propertyId={propertyId} goal={goal} unit={unit} now={now} />
    )
}

interface YearBodyProps {
    goal: GoalProgress
    unit: PaceUnit
    monthIndex: number
}

const YearBody = ({ goal, unit, monthIndex }: YearBodyProps) => {
    const pace = buildYearPace({
        months: goal.months,
        yearTarget: goal.yearTarget,
        currentMonthIndex: monthIndex,
    })

    return (
        <PaceBody
            pace={pace}
            unit={unit}
            period="year"
            target={goal.yearTarget}
            targetLabel="Meta do ano"
            accumulatedLabel={`Acumulado · até ${MONTH_LABELS[monthIndex] ?? ""}`}
        />
    )
}

interface MonthBodyProps {
    propertyId: string
    goal: GoalProgress
    unit: PaceUnit
    now: Date
}

const MonthBody = ({ propertyId, goal, unit, now }: MonthBodyProps) => {
    const meterQuery = useMeterByTarget("PROPERTY", propertyId)
    const hasMeter = Boolean(meterQuery.data)
    const monthWindow = resolveMonthlyHistoryWindow(now)

    const dailyQuery = useConsumption(
        "PROPERTY",
        hasMeter ? propertyId : undefined,
        "day",
        1,
        DAILY_PAGE_SIZE,
        { from: monthWindow.from, to: monthWindow.to, order: "asc" },
    )

    if (meterQuery.isLoading || (hasMeter && dailyQuery.isLoading))
        return <SectionSkeleton label="Carregando meta de consumo" testId="goal-skeleton" />

    if (!hasMeter) {
        return (
            <GoalEmpty message="Configure um medidor na propriedade para acompanhar a meta do mês." />
        )
    }

    if (dailyQuery.isError) {
        return (
            <SectionError
                message={
                    dailyQuery.error instanceof Error
                        ? dailyQuery.error.message
                        : "Não foi possível carregar o consumo do mês."
                }
                onRetry={() => void dailyQuery.refetch()}
            />
        )
    }

    return <MonthPace goal={goal} unit={unit} now={now} buckets={dailyQuery.data?.items ?? []} />
}

interface MonthPaceProps {
    goal: GoalProgress
    unit: PaceUnit
    now: Date
    buckets: ConsumptionBucket[]
}

const MonthPace = ({ goal, unit, now, buckets }: MonthPaceProps) => {
    const daily = dailyValuesFromBuckets(buckets, unit)
    const closedDays = now.getDate() - 1
    const target = goal.currentMonthTarget ?? goal.months[currentGoalMonthIndex(now)]?.target ?? 0
    const pace = buildMonthPace({ daily, closedDays, daysInMonth: daysInMonth(now), target })
    const costUnavailable = unit === "BRL" && buckets.length > 0 && daily.length === 0

    return (
        <PaceBody
            pace={pace}
            unit={unit}
            period="month"
            target={target}
            targetLabel="Meta do mês"
            accumulatedLabel={closedDays > 0 ? `Acumulado · até o dia ${closedDays}` : "Acumulado"}
            note={monthNote(unit, costUnavailable)}
            // Em R$ a projeção é só da parte variável e a meta é a cheia: a situação
            // erraria sempre a favor, então não se mostra.
            showSituation={unit !== "BRL"}
        />
    )
}

const monthNote = (unit: PaceUnit, costUnavailable: boolean): string | undefined => {
    if (costUnavailable) {
        return "O custo diário não é calculado para a tarifa desta propriedade (Grupo A e Tarifa Branca só têm custo no mês fechado). Use o Ano ou o consumo em kWh."
    }
    if (unit === "BRL") {
        return "Custo diário sem cobranças fixas (piso, iluminação pública e demanda): a projeção vale só para a parte variável, e a página Metas conta o mês cheio. Por isso não há situação contra a meta."
    }
    return undefined
}

interface PaceBodyProps {
    pace: Pace
    unit: PaceUnit
    period: PacePeriod
    target: number
    targetLabel: string
    accumulatedLabel: string
    note?: string
    /** Falso esconde a Situação e tira da projeção a cor de veredito. */
    showSituation?: boolean
}

const PaceBody = ({
    pace,
    unit,
    period,
    target,
    targetLabel,
    accumulatedLabel,
    note,
    showSituation = true,
}: PaceBodyProps) => {
    const situationTone: GoalTone = deviationTone(pace.situationPercent)
    const projectionTone =
        showSituation && pace.situationPercent !== null ? situationTone : undefined

    return (
        <>
            <dl
                className="border-divider m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] border-b"
                data-testid="goal-stats"
            >
                <SectionStat label={targetLabel} value={formatGoalValue(target, unit)} />
                <SectionStat
                    label={accumulatedLabel}
                    value={
                        pace.accumulated === null ? "-" : formatGoalValue(pace.accumulated, unit)
                    }
                />
                <SectionStat
                    label="Projeção de fechamento"
                    value={pace.projected === null ? "-" : formatGoalValue(pace.projected, unit)}
                    tone={projectionTone}
                />
                {showSituation && (
                    <SectionStat
                        label="Situação"
                        value={
                            pace.situationPercent === null
                                ? "-"
                                : `${formatDeviation(pace.situationPercent)} vs. meta`
                        }
                        tone={pace.situationPercent === null ? undefined : situationTone}
                    />
                )}
            </dl>
            {note && (
                <p className="text-muted text-12-5 m-0 px-5 pt-4" data-testid="goal-note">
                    {note}
                </p>
            )}
            <div className="p-5">
                <GoalPaceChart points={pace.points} unit={unit} period={period} target={target} />
            </div>
        </>
    )
}

interface ToggleProps<T extends string> {
    label: string
    options: readonly { value: T; label: string }[]
    value: T
    onChange: (next: T) => void
    testIdPrefix: string
}

const Toggle = <T extends string>({
    label,
    options,
    value,
    onChange,
    testIdPrefix,
}: ToggleProps<T>) => (
    <div role="group" aria-label={label} className="flex gap-1.5">
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                className="lt-selbtn"
                data-on={value === option.value}
                aria-pressed={value === option.value}
                data-testid={`${testIdPrefix}-${option.value}`}
                onClick={() => onChange(option.value)}
            >
                {option.label}
            </button>
        ))}
    </div>
)

interface LegendItemProps {
    color: string
    label: string
    dashed?: boolean
}

const LegendItem = ({ color, label, dashed = false }: LegendItemProps) => (
    <li className="text-12 inline-flex items-center gap-2">
        <span
            aria-hidden="true"
            className="h-3 w-3"
            style={dashed ? { border: `1px dashed ${color}` } : { backgroundColor: color }}
        />
        {label}
    </li>
)

interface GoalEmptyProps {
    message: string
    action?: ReactNode
}

const GoalEmpty = ({ message, action }: GoalEmptyProps) => (
    <div
        className="border-divider m-5 flex flex-col items-center gap-3 border border-dashed px-5 py-8 text-center"
        data-testid="goal-empty"
    >
        <p className="text-muted m-0 text-sm">{message}</p>
        {action}
    </div>
)
