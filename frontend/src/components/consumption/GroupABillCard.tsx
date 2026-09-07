import { useMemo } from "react"
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
import { formatCostBrl, formatKw, formatKwh } from "@/lib/formatters/consumption"
import {
    TARIFF_POST_LABELS,
    type ConsumptionBucket,
    type TariffPost,
} from "@/types/consumption.types"

interface GroupABillCardProps {
    /** Bucket mensal com `groupA` já presente — garantido pelo chamador
     * (`GroupABillSection` só renderiza este card quando há bucket). */
    bucket: ConsumptionBucket
}

interface ChartDatum {
    post: TariffPost
    label: string
    kwh: number
    brl: number
}

interface RechartsPayloadEntry {
    payload: ChartDatum
}

const isRechartsPayloadEntry = (v: unknown): v is RechartsPayloadEntry =>
    typeof v === "object" &&
    v !== null &&
    "payload" in v &&
    typeof (v as RechartsPayloadEntry).payload === "object"

interface ChartTooltipProps {
    active?: boolean
    payload?: unknown[]
}

const PostChartTooltip = ({ active, payload }: ChartTooltipProps) => {
    if (!active || !Array.isArray(payload) || payload.length === 0) return null

    const entry = payload[0]
    if (!isRechartsPayloadEntry(entry)) return null
    const datum = entry.payload

    return (
        <div className="border-divider bg-surface rounded-md border px-3 py-2 text-xs shadow-md">
            <p className="text-text font-medium">{datum.label}</p>
            <div className="mt-1 flex flex-col gap-0.5">
                <p className="text-text/80">
                    <span className="font-mono tabular-nums">{formatKwh(datum.kwh)}</span>{" "}
                    <span className="text-muted">kWh</span>
                </p>
                <p className="text-text/80">
                    <span className="text-muted">Custo:</span>{" "}
                    <span className="font-mono tabular-nums">{formatCostBrl(datum.brl)}</span>
                </p>
            </div>
        </div>
    )
}

/**
 * Decomposição da conta binômia do Grupo A — demanda contratada, consumo por
 * posto (tabela + mini gráfico Ponta×Fora de Ponta) e o total, com
 * ultrapassagem de demanda e energia reativa excedente exibidas só quando
 * há valor a cobrar (a maioria das contas não tem nenhuma das duas). O
 * bundle de design tem handoff de Grupo A (campos de cadastro, widget
 * "Demanda atual vs. contratada" do Painel), mas nenhum mockup
 * especificamente para um cartão de conta mensal detalhada por posto na
 * página de detalhes da propriedade — layout segue a linguagem visual já
 * usada pelos widgets do bundle (cabeçalho com legenda de cor + grid de
 * estatísticas em `.blueprint`), sem inventar uma estética nova.
 */
export const GroupABillCard = ({ bucket }: GroupABillCardProps) => {
    const groupA = bucket.groupA
    if (!groupA) return null

    return (
        <div className="flex flex-col gap-4" data-testid="group-a-bill-card">
            <div
                className="grid grid-cols-2 gap-px md:grid-cols-4"
                data-testid="group-a-bill-stats"
            >
                <Stat label="Demanda contratada" value={formatKw(groupA.contractedDemandKw)} />
                <Stat label="Parcela de demanda" value={formatCostBrl(groupA.demandBrl)} />
                {groupA.ultrapassagemBrl > 0 && (
                    <Stat
                        label="Ultrapassagem de demanda"
                        value={formatCostBrl(groupA.ultrapassagemBrl)}
                    />
                )}
                <Stat label="Bandeira" value={formatCostBrl(groupA.flagBrl)} />
                {groupA.ereBrl > 0 && (
                    <Stat label="Energia reativa excedente" value={formatCostBrl(groupA.ereBrl)} />
                )}
                <Stat label="Total da conta" value={formatCostBrl(bucket.costBrl)} accent />
            </div>

            <PostTable energyByPost={groupA.energyByPost} />
            <PostChart energyByPost={groupA.energyByPost} />
        </div>
    )
}

interface PostTableProps {
    energyByPost: NonNullable<ConsumptionBucket["groupA"]>["energyByPost"]
}

const PostTable = ({ energyByPost }: PostTableProps) => (
    <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="group-a-post-table">
            <thead className="bg-surface">
                <tr className="text-muted text-left text-xs tracking-wide uppercase">
                    <th scope="col" className="px-4 py-3 font-medium">
                        Posto
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        kWh
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                        Custo
                    </th>
                </tr>
            </thead>
            <tbody className="divide-divider divide-y">
                {energyByPost.map((p) => (
                    <tr key={p.post} className="text-text">
                        <td className="px-4 py-3">{TARIFF_POST_LABELS[p.post]}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatKwh(p.kwhConsumed)}
                        </td>
                        <td className="text-text/80 px-4 py-3 text-right font-mono tabular-nums">
                            {formatCostBrl(p.brl)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)

interface PostChartProps {
    energyByPost: NonNullable<ConsumptionBucket["groupA"]>["energyByPost"]
}

/** Mini gráfico Ponta×Fora de Ponta — critério de aceite "gráfico distingue os postos". */
const PostChart = ({ energyByPost }: PostChartProps) => {
    const chartData: ChartDatum[] = useMemo(
        () =>
            energyByPost.map((p) => ({
                post: p.post,
                label: TARIFF_POST_LABELS[p.post],
                kwh: p.kwhConsumed,
                brl: p.brl,
            })),
        [energyByPost],
    )

    return (
        <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" />
                <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "var(--color-text)", fillOpacity: 0.55 }}
                />
                <YAxis
                    tick={{ fontSize: 12, fill: "var(--color-text)", fillOpacity: 0.55 }}
                    tickFormatter={(value: number) => `${value} kWh`}
                    width={70}
                />
                <Tooltip content={<PostChartTooltip />} />
                <Bar dataKey="kwh" radius={[4, 4, 0, 0]} name="kWh">
                    {chartData.map((entry) => (
                        <Cell
                            key={entry.post}
                            fill={
                                entry.post === "PEAK"
                                    ? "var(--color-chart-amber)"
                                    : "var(--color-chart-blue)"
                            }
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}

interface StatProps {
    label: string
    value: string
    accent?: boolean
}

const Stat = ({ label, value, accent = false }: StatProps) => (
    <div className="border-divider bg-surface border p-4">
        <div className="font-heading text-muted text-11 font-semibold tracking-[.07em] uppercase">
            {label}
        </div>
        <div
            className={`font-heading mt-2 text-2xl leading-none font-semibold ${accent ? "text-accent" : "text-text"}`}
        >
            {value}
        </div>
    </div>
)
