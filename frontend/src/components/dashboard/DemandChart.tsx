import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceArea,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import {
    buildDemandSeries,
    formatDemandKw,
    peakBand,
    type DemandSeriesEntry,
} from "@/lib/demandOverview"
import { TARIFF_POST_LABELS } from "@/types/consumption.types"
import type { DemandPoint } from "@/types/demand.types"

export const MEASURED_COLOR = "var(--color-chart-blue)"
export const CONTRACTED_COLOR = "var(--color-status-danger)"
const PEAK_COLOR = "var(--color-chart-amber)"

const DAY_MINUTES = 24 * 60
const AXIS_TICKS = [0, 6, 12, 18, 24].map((hour) => hour * 60)

const hourLabel = (minutes: number): string => `${String(minutes / 60).padStart(2, "0")}h`

const isSeriesEntry = (value: unknown): value is DemandSeriesEntry =>
    typeof value === "object" && value !== null && "range" in value && "contractedKw" in value

interface TooltipProps {
    active?: boolean
    payload?: { payload?: unknown }[]
}

const ChartTooltip = ({ active, payload }: TooltipProps) => {
    const entry = payload?.[0]?.payload
    if (!active || !isSeriesEntry(entry)) return null

    return (
        <div className="border-divider bg-surface border px-3 py-2 text-xs">
            <p className="font-heading font-semibold">{entry.range}</p>
            <p className="text-muted mt-0.5">Medida: {formatDemandKw(entry.kw)}</p>
            <p className="text-muted mt-0.5">Contratada: {formatDemandKw(entry.contractedKw)}</p>
        </div>
    )
}

interface DemandChartProps {
    points: DemandPoint[]
}

/**
 * Demanda do dia contra a contratada (LumiTrack Home v2.dc.html, Painel →
 * "Demanda atual vs. contratada"): a demanda medida de cada janela de 15
 * minutos em azul, a contratada em vermelho tracejado e a faixa da ponta em
 * âmbar. A contratada é um degrau: cada janela usa a do posto dela, então na
 * Azul a linha muda de valor quando a ponta começa e termina. Janela sem
 * medição é um buraco na curva — nunca uma queda a 0 kW.
 */
export const DemandChart = ({ points }: DemandChartProps) => {
    const series = buildDemandSeries(points)
    const band = peakBand(series)

    return (
        <div data-testid="demand-chart">
            <div aria-hidden="true" data-testid="demand-chart-graphic">
                <ChartGraphic series={series} band={band} />
            </div>
            <DemandTable points={points} series={series} />
        </div>
    )
}

// O desenho só se vê com o mouse; esta tabela, escondida da tela, dá ao
// teclado e ao leitor de tela os mesmos valores do gráfico e do tooltip.
const DemandTable = ({
    points,
    series,
}: {
    points: DemandPoint[]
    series: DemandSeriesEntry[]
}) => (
    <table className="sr-only">
        <caption>Demanda medida e contratada por janela de 15 minutos</caption>
        <thead>
            <tr>
                <th scope="col">Janela</th>
                <th scope="col">Demanda medida</th>
                <th scope="col">Demanda contratada</th>
                <th scope="col">Posto</th>
            </tr>
        </thead>
        <tbody>
            {series.map((entry, index) => {
                const post = points[index]?.post
                return (
                    <tr key={entry.x}>
                        <th scope="row">{entry.range}</th>
                        <td>{formatDemandKw(entry.kw)}</td>
                        <td>{formatDemandKw(entry.contractedKw)}</td>
                        <td>{post ? TARIFF_POST_LABELS[post] : "-"}</td>
                    </tr>
                )
            })}
        </tbody>
    </table>
)

// Elemento e não componente: o Recharts só reconhece seus filhos diretos no gráfico.
const GRADIENT_DEFS = (
    <defs>
        <linearGradient id="demand-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={MEASURED_COLOR} stopOpacity={0.24} />
            <stop offset="1" stopColor={MEASURED_COLOR} stopOpacity={0} />
        </linearGradient>
    </defs>
)

const peakArea = (band: { from: number; to: number } | null) =>
    band && (
        <ReferenceArea
            x1={band.from}
            x2={band.to}
            fill={PEAK_COLOR}
            fillOpacity={0.13}
            stroke={PEAK_COLOR}
            strokeDasharray="3 3"
            label={{
                value: `PONTA ${band.from / 60}h–${band.to / 60}h`,
                position: "insideTop",
                fontSize: 10.5,
                fill: PEAK_COLOR,
            }}
        />
    )

interface ChartGraphicProps {
    series: DemandSeriesEntry[]
    band: { from: number; to: number } | null
}

const ChartGraphic = ({ series, band }: ChartGraphicProps) => (
    <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
            // O desenho está fora da árvore de acessibilidade (a tabela dá os valores);
            // a camada de acessibilidade do Recharts o deixaria focável por teclado.
            accessibilityLayer={false}
            data={series}
            margin={{ top: 16, right: 8, left: 8, bottom: 8 }}
        >
            {GRADIENT_DEFS}
            <CartesianGrid strokeDasharray="3 3" className="stroke-divider" vertical={false} />
            <XAxis
                type="number"
                dataKey="x"
                domain={[0, DAY_MINUTES]}
                ticks={AXIS_TICKS}
                tickFormatter={hourLabel}
                tick={{ fontSize: 12 }}
            />
            <YAxis
                tick={{ fontSize: 12 }}
                width={64}
                tickFormatter={(value: number) => value.toLocaleString("pt-BR")}
            />
            <Tooltip content={<ChartTooltip />} cursor={false} />
            {peakArea(band)}
            <Area
                dataKey="kw"
                type="monotone"
                stroke={MEASURED_COLOR}
                strokeWidth={2}
                fill="url(#demand-fill)"
                connectNulls={false}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
            />
            <Line
                dataKey="contractedKw"
                type="stepAfter"
                stroke={CONTRACTED_COLOR}
                strokeWidth={1.5}
                strokeDasharray="2 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
            />
        </ComposedChart>
    </ResponsiveContainer>
)
