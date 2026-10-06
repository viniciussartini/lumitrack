import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts"
import { formatWeightPercent, type WeightSlice } from "@/lib/areaWeight"
import { formatKwh } from "@/lib/formatters/consumption"

interface AreaWeightChartProps {
    slices: WeightSlice[]
    totalKwh: number
}

/**
 * Pizza (rosca) do peso de cada área no consumo do mês (LumiTrack Home
 * v2.dc.html, Painel → "Peso de cada medidor"): o total no centro, a legenda
 * com o percentual de cada área e, escondida da tela, a tabela com nome, kWh e
 * % para o leitor de tela. O desenho e a legenda ficam fora da árvore de
 * acessibilidade — a tabela é o caminho acessível, sem leitura em dobro.
 */
export const AreaWeightChart = ({ slices, totalKwh }: AreaWeightChartProps) => (
    <div className="flex flex-col items-center gap-4" data-testid="area-weight-chart">
        <div aria-hidden="true" className="flex w-full flex-col items-center gap-4">
            <PieGraphic slices={slices} totalKwh={totalKwh} />
            <Legend slices={slices} />
        </div>
        <WeightTable slices={slices} />
    </div>
)

const PieGraphic = ({ slices, totalKwh }: AreaWeightChartProps) => (
    <div
        className="relative w-full"
        style={{ maxWidth: 190 }}
        data-testid="area-weight-chart-graphic"
    >
        <ResponsiveContainer width="100%" aspect={1}>
            <PieChart
                // O desenho está fora da árvore de acessibilidade (a tabela dá os valores);
                // a camada de acessibilidade do Recharts o deixaria focável por teclado.
                accessibilityLayer={false}
            >
                <Pie
                    data={slices}
                    dataKey="kwh"
                    nameKey="name"
                    innerRadius="59%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="var(--color-bg)"
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    // O Recharts põe o grupo da pizza na ordem de tabulação mesmo sem a
                    // camada de acessibilidade; a tabela sr-only é o caminho do teclado.
                    rootTabIndex={-1}
                >
                    {slices.map((slice) => (
                        <Cell key={slice.id} fill={slice.color} />
                    ))}
                </Pie>
            </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-heading text-26 leading-none font-semibold">
                {Math.round(totalKwh).toLocaleString("pt-BR")}
            </span>
            <span className="text-muted text-11 mt-1">kWh/mês</span>
        </div>
    </div>
)

const Legend = ({ slices }: Pick<AreaWeightChartProps, "slices">) => (
    <ul className="m-0 flex w-full list-none flex-wrap justify-center gap-x-4 gap-y-2 p-0">
        {slices.map((slice) => (
            <li key={slice.id} className="text-12-5 inline-flex items-center gap-2">
                <span
                    className="h-3 w-3 shrink-0"
                    style={{ backgroundColor: slice.color }}
                    data-testid={`area-weight-swatch-${slice.id}`}
                />
                <span>{slice.name}</span>
                <span className="font-heading text-14 text-text/70 font-semibold tabular-nums">
                    {formatWeightPercent(slice.percent)}
                </span>
            </li>
        ))}
    </ul>
)

const WeightTable = ({ slices }: Pick<AreaWeightChartProps, "slices">) => (
    <table className="sr-only">
        <caption>Peso de cada área no consumo do mês</caption>
        <thead>
            <tr>
                <th scope="col">Área</th>
                <th scope="col">Consumo no mês</th>
                <th scope="col">Participação</th>
            </tr>
        </thead>
        <tbody>
            {slices.map((slice) => (
                <tr key={slice.id}>
                    <th scope="row">{slice.name}</th>
                    <td>{formatKwh(slice.kwh)} kWh</td>
                    <td>{formatWeightPercent(slice.percent)}</td>
                </tr>
            ))}
        </tbody>
    </table>
)
