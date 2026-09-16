import { useState } from "react"
import { Link, useParams } from "react-router"
import { AlertCircle, ArrowLeft, Scale } from "lucide-react"
import { useProperty } from "@/hooks/queries/useProperties"
import { useBrancaComparison } from "@/hooks/queries/useBrancaComparison"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { formatBrl, formatPercent } from "@/lib/format"
import { formatBucketLabel } from "@/lib/formatters/consumption"
import type { BrancaComparisonVerdict } from "@/types/branca-comparison.types"

// TODO(design): aguardando handoff — Comparação Convencional × Branca. O
// `10-design-system.md` só cobre cobertura indireta via os postos horários
// configuráveis (compartilhados com a fundação da Fase 19), regra de
// ausência do `10`. Layout provisório: mesma decisão já tomada na Fase 21
// para `AclComparisonPage.tsx` — reaproveita a linguagem visual já usada
// (`.blueprint` + grid de estatísticas + tabela), sem inventar uma estética
// nova. Revisar quando a tela ganhar handoff.

const toMonthInputValue = (date: Date): string =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`

// `undefined` para "YYYY-MM" incompleto ou vazio — mesmo motivo de
// `AclComparisonPage`: sem isso, `Invalid Date` passaria adiante e só
// estouraria dentro de `toISOString()` no service.
const fromMonthInputValue = (value: string): Date | undefined => {
    const match = /^(\d{4})-(\d{2})$/.exec(value)
    if (!match) return undefined
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
}

/** Janela default — últimos 6 meses até o mês corrente, dentro do teto de 24 meses do backend. */
const defaultMonthRange = (): { from: string; to: string } => {
    const now = new Date()
    const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5, 1))
    return { from: toMonthInputValue(from), to: toMonthInputValue(to) }
}

const VERDICT_LABELS: Record<BrancaComparisonVerdict, string> = {
    BRANCA_CHEAPER: "A Tarifa Branca saiu mais barata",
    CONVENCIONAL_CHEAPER: "A Convencional teria sido mais barata",
    EQUIVALENT: "Os dois cenários custariam praticamente o mesmo",
}

const VERDICT_TONE: Record<BrancaComparisonVerdict, string> = {
    BRANCA_CHEAPER: "text-status-success",
    CONVENCIONAL_CHEAPER: "text-status-danger",
    EQUIVALENT: "text-muted",
}

/**
 * Comparação Convencional × Branca — responde "vale a pena aderir?" a
 * partir do consumo real medido, recalculado nos dois cenários para o
 * mesmo período. Só disponível para propriedade já na Tarifa Branca
 * (`groupBModality` WHITE) — ver `ConsumptionService.compareBrancaToConvencional`
 * no backend, mesmo papel de `AclComparisonPage` para o Mercado Livre.
 *
 * Dispatcher sem hooks próprios (mesmo padrão de `AclComparisonPage`): a
 * página resolve a propriedade primeiro e só entra no corpo real depois que
 * ela existe e está na Branca.
 */
export const BrancaComparisonPage = () => {
    const { id } = useParams<{ id: string }>()
    const propertyQuery = useProperty(id)

    if (propertyQuery.isLoading) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink propertyId={id} />
                <div className="blueprint h-40 animate-pulse" aria-busy="true" />
            </div>
        )
    }

    if (propertyQuery.isError || !propertyQuery.data) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink propertyId={id} />
                <EmptyState
                    icon={AlertCircle}
                    title="Não foi possível carregar a propriedade"
                    description={
                        propertyQuery.error instanceof Error
                            ? propertyQuery.error.message
                            : "Tente novamente em instantes."
                    }
                />
            </div>
        )
    }

    const property = propertyQuery.data

    if (property.groupBModality !== "WHITE") {
        return (
            <div className="flex flex-col gap-6">
                <BackLink propertyId={property.id} />
                <EmptyState
                    icon={Scale}
                    title="Disponível só para propriedades na Tarifa Branca"
                    description={`${property.name} está na modalidade Convencional. Marque a propriedade como Tarifa Branca para comparar.`}
                    action={
                        <Button asChild variant="secondary">
                            <Link to={`/propriedades/${property.id}`}>Ir para a propriedade</Link>
                        </Button>
                    }
                />
            </div>
        )
    }

    return <BrancaComparisonContent propertyId={property.id} propertyName={property.name} />
}

interface BrancaComparisonContentProps {
    propertyId: string
    propertyName: string
}

const BrancaComparisonContent = ({ propertyId, propertyName }: BrancaComparisonContentProps) => {
    const [range, setRange] = useState(defaultMonthRange)
    const from = fromMonthInputValue(range.from)
    const to = fromMonthInputValue(range.to)
    const comparisonQuery = useBrancaComparison(propertyId, from, to)

    return (
        <div className="flex flex-col gap-6">
            <BackLink propertyId={propertyId} />

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="font-heading text-[clamp(22px,2.4vw,28px)] leading-none font-semibold uppercase">
                        Comparação Convencional × Branca
                    </h1>
                    <p className="text-muted mt-2 max-w-[60ch] text-sm">
                        {propertyName} — custo real recalculado nos dois cenários (Convencional e
                        Tarifa Branca) para o mesmo consumo medido.
                    </p>
                </div>
                <PeriodPicker range={range} onChange={setRange} />
            </div>

            {comparisonQuery.isLoading && (
                <div
                    className="blueprint h-64 animate-pulse"
                    aria-busy="true"
                    aria-label="Calculando comparação"
                />
            )}

            {comparisonQuery.isError && (
                <div
                    role="alert"
                    className="border-status-danger/40 flex items-start gap-3 border p-4"
                >
                    <AlertCircle
                        className="text-status-danger h-5 w-5 shrink-0"
                        aria-hidden="true"
                    />
                    <p className="text-status-danger/85 text-sm">
                        {comparisonQuery.error instanceof Error
                            ? comparisonQuery.error.message
                            : "Não foi possível calcular a comparação."}
                    </p>
                </div>
            )}

            {comparisonQuery.isSuccess && (
                <>
                    <VerdictCard comparison={comparisonQuery.data} />
                    <MonthsTable months={comparisonQuery.data.months} />
                </>
            )}
        </div>
    )
}

interface BackLinkProps {
    propertyId: string | undefined
}

const BackLink = ({ propertyId }: BackLinkProps) => (
    <Link
        to={propertyId ? `/propriedades/${propertyId}` : "/propriedades"}
        className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm"
    >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para a propriedade
    </Link>
)

interface PeriodPickerProps {
    range: { from: string; to: string }
    onChange: (range: { from: string; to: string }) => void
}

const PeriodPicker = ({ range, onChange }: PeriodPickerProps) => (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Período comparado">
        <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted font-heading text-11 font-semibold tracking-[.07em] uppercase">
                De
            </span>
            <input
                type="month"
                className="input lt-input"
                value={range.from}
                max={range.to}
                onChange={(e) => onChange({ ...range, from: e.target.value })}
            />
        </label>
        <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted font-heading text-11 font-semibold tracking-[.07em] uppercase">
                Até
            </span>
            <input
                type="month"
                className="input lt-input"
                value={range.to}
                min={range.from}
                onChange={(e) => onChange({ ...range, to: e.target.value })}
            />
        </label>
    </div>
)

interface VerdictCardProps {
    comparison: {
        totalConvencionalBrl: number
        totalBrancaBrl: number
        totalDiffBrl: number
        diffPercent: number
        verdict: BrancaComparisonVerdict
    }
}

const VerdictCard = ({ comparison }: VerdictCardProps) => (
    <Blueprint className="flex flex-col gap-4 p-5">
        <div>
            <span className="font-heading text-muted text-11 font-semibold tracking-[.07em] uppercase">
                Veredito do período
            </span>
            <p
                className={`font-heading mt-1 text-xl font-semibold ${VERDICT_TONE[comparison.verdict]}`}
            >
                {VERDICT_LABELS[comparison.verdict]}
            </p>
        </div>
        <div className="grid grid-cols-2 gap-px md:grid-cols-4">
            <Stat
                label="Total na Convencional"
                value={formatBrl(comparison.totalConvencionalBrl)}
            />
            <Stat label="Total na Branca" value={formatBrl(comparison.totalBrancaBrl)} />
            <Stat label="Diferença" value={formatBrl(Math.abs(comparison.totalDiffBrl))} accent />
            <Stat
                label="Percentual"
                value={formatPercent(Math.abs(comparison.diffPercent) / 100)}
                accent
            />
        </div>
    </Blueprint>
)

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

interface MonthsTableProps {
    months: { monthStart: string; convencionalBrl: number; brancaBrl: number; diffBrl: number }[]
}

const MonthsTable = ({ months }: MonthsTableProps) => (
    <Blueprint className="p-0">
        <div className="border-divider border-b px-5 py-4">
            <h2 className="font-heading text-17 font-semibold uppercase">Mês a mês</h2>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-surface">
                    <tr className="text-muted text-left text-xs tracking-wide uppercase">
                        <th scope="col" className="px-4 py-3 font-medium">
                            Mês
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                            Convencional
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                            Branca
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                            Diferença
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-divider divide-y">
                    {months.map((month) => (
                        <tr key={month.monthStart} className="text-text">
                            <td className="px-4 py-3">
                                {formatBucketLabel(month.monthStart, "month")}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {formatBrl(month.convencionalBrl)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {formatBrl(month.brancaBrl)}
                            </td>
                            <td
                                className={`px-4 py-3 text-right font-mono tabular-nums ${month.diffBrl >= 0 ? "text-status-success" : "text-status-danger"}`}
                            >
                                {formatBrl(month.diffBrl)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </Blueprint>
)
