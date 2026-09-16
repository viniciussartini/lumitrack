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
import { Tag } from "@/components/ui/Tag"
import { formatCostBrl, formatKwh } from "@/lib/formatters/consumption"
import {
    TARIFF_POST_LABELS,
    type ConsumptionBucket,
    type TariffPost,
} from "@/types/consumption.types"

interface GroupBWhiteBillCardProps {
    /** Bucket mensal com `groupBWhite` já presente — garantido pelo chamador
     * (`GroupBWhiteBillSection` só renderiza este card quando há bucket). */
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

// Só existem 2 tokens de cor de gráfico na escala (`--color-chart-amber`,
// `--color-chart-blue`) — o Grupo A nunca precisou de um terceiro (só
// Ponta/Fora de Ponta). Sem token próprio pro Intermediário no handoff,
// `color-mix` (já usado em `industry.css` para `--color-divider`) deriva um
// tom intermediário do próprio azul em vez de inventar uma cor fora da
// escala.
const POST_CHART_COLOR: Record<TariffPost, string> = {
    PEAK: "var(--color-chart-amber)",
    INTERMEDIATE: "color-mix(in srgb, var(--color-chart-blue) 55%, var(--color-chart-amber) 45%)",
    OFF_PEAK: "var(--color-chart-blue)",
}

/**
 * Decomposição da conta da Tarifa Branca (Grupo B) — energia por posto
 * (tabela + mini gráfico Ponta/Intermediário/Fora de Ponta), bandeira, CIP e
 * o total. Abaixo do piso de disponibilidade a conta inteira usa a tarifa
 * Convencional (REN 1.098/2024) — sem decomposição por posto nesse caso
 * (`energyByPost` vazio); um aviso substitui a tabela/gráfico, sem inventar
 * uma decomposição que o backend não calculou. Sem mockup específico da
 * Branca no handoff de design (`10-design-system.md`, regra de ausência) —
 * layout reaproveita a mesma linguagem visual de `GroupABillCard.tsx`
 * (cabeçalho com legenda + grid de estatísticas + tabela/gráfico por posto).
 */
export const GroupBWhiteBillCard = ({ bucket }: GroupBWhiteBillCardProps) => {
    const groupBWhite = bucket.groupBWhite
    if (!groupBWhite) return null

    return (
        <div className="flex flex-col gap-4" data-testid="group-b-white-bill-card">
            {groupBWhite.belowAvailabilityFloor && (
                <div
                    className="border-status-warning/40 bg-status-warning/10 flex items-start gap-2 border p-3 text-xs"
                    data-testid="group-b-white-floor-notice"
                >
                    <Tag variant="outline">Piso de disponibilidade</Tag>
                    <p className="text-text/80">
                        Consumo abaixo do piso — a conta inteira foi calculada pela tarifa
                        Convencional, não pela decomposição por posto da Branca (REN 1.098/2024).
                    </p>
                </div>
            )}

            <div
                className="grid grid-cols-2 gap-px md:grid-cols-4"
                data-testid="group-b-white-bill-stats"
            >
                <Stat label="Energia" value={formatCostBrl(groupBWhite.energyBrl)} />
                <Stat label="Bandeira" value={formatCostBrl(groupBWhite.flagBrl)} />
                <Stat label="Tributos" value={formatCostBrl(groupBWhite.taxesBrl)} />
                <Stat label="Total da conta" value={formatCostBrl(bucket.costBrl)} accent />
            </div>

            {groupBWhite.energyByPost.length > 0 && (
                <>
                    <PostTable energyByPost={groupBWhite.energyByPost} />
                    <PostChart energyByPost={groupBWhite.energyByPost} />
                </>
            )}
        </div>
    )
}

interface PostTableProps {
    energyByPost: NonNullable<ConsumptionBucket["groupBWhite"]>["energyByPost"]
}

const PostTable = ({ energyByPost }: PostTableProps) => (
    <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="group-b-white-post-table">
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
    energyByPost: NonNullable<ConsumptionBucket["groupBWhite"]>["energyByPost"]
}

/** Mini gráfico Ponta/Intermediário/Fora de Ponta — mesmo padrão de `GroupABillCard`. */
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
                        <Cell key={entry.post} fill={POST_CHART_COLOR[entry.post]} />
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
