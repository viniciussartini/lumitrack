import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { REALIZED_COLOR, TARGET_COLOR } from "@/components/goal/GoalProgressChart"
import type { PacePoint, PaceUnit } from "@/lib/goalPace"
import { formatGoalValue } from "@/lib/goals"

const OVER_TARGET_COLOR = "var(--color-status-danger)"

export type PacePeriod = "month" | "year"

const PERIOD_LABELS: Record<PacePeriod, { column: string; caption: string }> = {
    month: { column: "Dia", caption: "Acumulado e meta acumulada por dia do mês" },
    year: { column: "Mês", caption: "Acumulado e meta acumulada por mês do ano" },
}

const isPacePoint = (value: unknown): value is PacePoint =>
    typeof value === "object" && value !== null && "label" in value && "targetAccumulated" in value

interface TooltipProps {
    active?: boolean
    payload?: { payload?: unknown }[]
    unit: PaceUnit
    period: PacePeriod
}

const ChartTooltip = ({ active, payload, unit, period }: TooltipProps) => {
    const point = payload?.[0]?.payload
    if (!active || !isPacePoint(point)) return null

    return (
        <div className="border-divider bg-surface border px-3 py-2 text-xs">
            <p className="font-heading font-semibold">
                {period === "month" ? `Dia ${point.label}` : point.label}
            </p>
            <p className="text-muted mt-0.5">
                Acumulado:{" "}
                {point.accumulated === null ? "-" : formatGoalValue(point.accumulated, unit)}
            </p>
            <p className="text-muted mt-0.5">
                Meta acumulada: {formatGoalValue(point.targetAccumulated, unit)}
            </p>
        </div>
    )
}

interface GoalPaceChartProps {
    points: PacePoint[]
    unit: PaceUnit
    period: PacePeriod
    /** Meta do período inteiro: a linha de referência no topo do ritmo. */
    target: number
}

/**
 * Acumulado do período contra o ritmo da meta (LumiTrack Home v2.dc.html,
 * Painel → "Meta de consumo"): barras do acumulado em azul, vermelhas quando
 * passam da meta acumulada até ali, sobre barras tracejadas âmbar da meta
 * acumulada, e a linha da meta do período. Dia ou mês sem leitura não tem
 * barra de acumulado — vazio, nunca uma barra em 0.
 */
export const GoalPaceChart = ({ points, unit, period, target }: GoalPaceChartProps) => (
    <div data-testid="goal-pace-chart">
        <div aria-hidden="true" data-testid="goal-pace-chart-graphic">
            <ChartGraphic points={points} unit={unit} period={period} target={target} />
        </div>
        <PaceTable points={points} unit={unit} period={period} />
    </div>
)

// O desenho só se vê com o mouse; esta tabela, escondida da tela, dá ao
// teclado e ao leitor de tela os mesmos valores do gráfico e do tooltip.
const PaceTable = ({ points, unit, period }: Omit<GoalPaceChartProps, "target">) => (
    <table className="sr-only">
        <caption>{PERIOD_LABELS[period].caption}</caption>
        <thead>
            <tr>
                <th scope="col">{PERIOD_LABELS[period].column}</th>
                <th scope="col">Acumulado</th>
                <th scope="col">Meta acumulada</th>
            </tr>
        </thead>
        <tbody>
            {points.map((point) => (
                <tr key={point.label}>
                    <th scope="row">{point.label}</th>
                    <td>
                        {point.accumulated === null
                            ? "-"
                            : formatGoalValue(point.accumulated, unit)}
                    </td>
                    <td>{formatGoalValue(point.targetAccumulated, unit)}</td>
                </tr>
            ))}
        </tbody>
    </table>
)

const ChartGraphic = ({ points, unit, period, target }: GoalPaceChartProps) => (
    <ResponsiveContainer width="100%" height={256}>
        <BarChart
            // O desenho está fora da árvore de acessibilidade (a tabela dá os valores);
            // a camada de acessibilidade do Recharts o deixaria focável por teclado.
            accessibilityLayer={false}
            data={points}
            margin={{ top: 16, right: 8, left: 8, bottom: 8 }}
        >
            <CartesianGrid strokeDasharray="3 3" className="stroke-divider" vertical={false} />
            <XAxis xAxisId="accumulated" dataKey="label" tick={{ fontSize: 12 }} minTickGap={12} />
            {/* Eixo oculto só para as barras da meta se sobreporem às do acumulado. */}
            <XAxis xAxisId="target" dataKey="label" hide />
            <YAxis
                tick={{ fontSize: 12 }}
                width={64}
                tickFormatter={(value: number) => value.toLocaleString("pt-BR")}
            />
            <Tooltip content={<ChartTooltip unit={unit} period={period} />} cursor={false} />
            <Bar
                xAxisId="target"
                dataKey="targetAccumulated"
                fill="none"
                stroke={TARGET_COLOR}
                strokeDasharray="2 3"
                isAnimationActive={false}
            />
            <Bar
                xAxisId="accumulated"
                dataKey="accumulated"
                fill={REALIZED_COLOR}
                isAnimationActive={false}
            >
                {points.map((point) => (
                    <Cell
                        key={point.label}
                        fill={
                            point.accumulated !== null &&
                            point.accumulated > point.targetAccumulated
                                ? OVER_TARGET_COLOR
                                : REALIZED_COLOR
                        }
                    />
                ))}
            </Bar>
            <ReferenceLine
                xAxisId="accumulated"
                y={target}
                stroke={OVER_TARGET_COLOR}
                strokeDasharray="2 4"
                label={{
                    value: `meta ${formatGoalValue(target, unit)}`,
                    position: "insideTopRight",
                    dy: -8,
                    fontSize: 11,
                    fill: OVER_TARGET_COLOR,
                }}
            />
        </BarChart>
    </ResponsiveContainer>
)
