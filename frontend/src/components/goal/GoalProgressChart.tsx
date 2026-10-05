import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { MONTH_LABELS, formatGoalValue } from "@/lib/goals"
import type { GoalProgressMonth, GoalUnit } from "@/types/goal.types"

export const TARGET_COLOR = "var(--color-chart-amber)"
export const REALIZED_COLOR = "var(--color-chart-blue)"
const OVER_TARGET_COLOR = "var(--color-status-danger)"

interface ChartPoint {
    label: string
    target: number
    realized: number | null
    overTarget: boolean
}

const toPoints = (months: GoalProgressMonth[]): ChartPoint[] =>
    months.map((month, index) => ({
        label: MONTH_LABELS[index] ?? String(month.month),
        target: month.target,
        realized: month.realized,
        overTarget: month.realized !== null && month.realized > month.target,
    }))

const isChartPoint = (value: unknown): value is ChartPoint =>
    typeof value === "object" && value !== null && "label" in value && "target" in value

interface TooltipProps {
    active?: boolean
    payload?: { payload?: unknown }[]
    unit: GoalUnit
}

const ChartTooltip = ({ active, payload, unit }: TooltipProps) => {
    const point = payload?.[0]?.payload
    if (!active || !isChartPoint(point)) return null

    return (
        <div className="border-divider bg-surface border px-3 py-2 text-xs">
            <p className="font-heading font-semibold">{point.label}</p>
            <p className="text-muted mt-0.5">Meta do mês: {formatGoalValue(point.target, unit)}</p>
            <p className="text-muted mt-0.5">
                Realizado: {point.realized === null ? "-" : formatGoalValue(point.realized, unit)}
            </p>
        </div>
    )
}

interface GoalProgressChartProps {
    months: GoalProgressMonth[]
    unit: GoalUnit
}

/**
 * Barras de meta × realizado por mês (LumiTrack Home v2.dc.html, Configurações
 * → Metas): a meta do mês em âmbar ao lado do realizado em azul, que fica
 * vermelho no mês em que passa da meta. Mês sem leitura não tem barra de
 * realizado — vazio, nunca uma barra em 0.
 */
export const GoalProgressChart = ({ months, unit }: GoalProgressChartProps) => (
    <div data-testid="goal-progress-chart">
        <div aria-hidden="true" data-testid="goal-progress-chart-graphic">
            <ChartGraphic months={months} unit={unit} />
        </div>
        <MonthlyTable months={months} unit={unit} />
    </div>
)

// O desenho só se vê com o mouse; esta tabela, escondida da tela, dá ao
// teclado e ao leitor de tela os mesmos valores do gráfico e do tooltip.
const MonthlyTable = ({ months, unit }: GoalProgressChartProps) => (
    <table className="sr-only">
        <caption>Meta e realizado por mês</caption>
        <thead>
            <tr>
                <th scope="col">Mês</th>
                <th scope="col">Meta no mês</th>
                <th scope="col">Realizado no mês</th>
            </tr>
        </thead>
        <tbody>
            {months.map((month, index) => (
                <tr key={month.month}>
                    <th scope="row">{MONTH_LABELS[index] ?? month.month}</th>
                    <td>{formatGoalValue(month.target, unit)}</td>
                    <td>{month.realized === null ? "-" : formatGoalValue(month.realized, unit)}</td>
                </tr>
            ))}
        </tbody>
    </table>
)

const ChartGraphic = ({ months, unit }: GoalProgressChartProps) => (
    <>
        <ResponsiveContainer width="100%" height={256}>
            <BarChart
                data={toPoints(months)}
                margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                barGap={4}
            >
                <CartesianGrid strokeDasharray="3 3" className="stroke-divider" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                    tick={{ fontSize: 12 }}
                    width={64}
                    tickFormatter={(value: number) => value.toLocaleString("pt-BR")}
                />
                <Tooltip content={<ChartTooltip unit={unit} />} cursor={false} />
                <Bar dataKey="target" fill={TARGET_COLOR} isAnimationActive={false} />
                <Bar dataKey="realized" fill={REALIZED_COLOR} isAnimationActive={false}>
                    {toPoints(months).map((point) => (
                        <Cell
                            key={point.label}
                            fill={point.overTarget ? OVER_TARGET_COLOR : REALIZED_COLOR}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </>
)
