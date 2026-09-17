import { useState } from "react"
import { Link, useParams } from "react-router"
import { AlertCircle, ArrowLeft, Scale } from "lucide-react"
import { useProperty } from "@/hooks/queries/useProperties"
import { useAclComparison } from "@/hooks/queries/useAclComparison"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Tag } from "@/components/ui/Tag"
import { formatBrl, formatPercent } from "@/lib/format"
import { formatBucketLabel } from "@/lib/formatters/consumption"
import { resolveDiffToneClass } from "@/lib/comparisonTone"
import { ACL_SUBMARKET_LABELS } from "@/types/acl-contract.types"
import type { AclComparisonVerdict } from "@/types/acl-comparison.types"

// TODO(design): aguardando handoff — Comparação ACR × ACL. O
// `10-design-system.md` confirma que não há mockup específico para esta
// tela (só o form de contrato ACL, embutido em PropertyForm, tem handoff).
// Layout provisório: segue a linguagem visual já usada em telas sem mockup
// próprio dentro do mesmo bloco de Grupo A/ACL (ver GroupABillCard.tsx —
// `.blueprint` + grid de estatísticas + tabela), sem inventar uma estética
// nova. Revisar quando a tela ganhar handoff.

const toMonthInputValue = (date: Date): string =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`

// `undefined` para "YYYY-MM" incompleto ou vazio (o usuário apagou o campo
// enquanto digita um novo mês) — sem isso, `Invalid Date` passaria adiante
// e só estouraria dentro de `toISOString()` no service, como um erro
// genérico de rede em vez de "escolha um mês válido".
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

const VERDICT_LABELS: Record<AclComparisonVerdict, string> = {
    ACL_CHEAPER: "O Mercado Livre saiu mais barato",
    ACR_CHEAPER: "O cativo teria sido mais barato",
    EQUIVALENT: "Os dois cenários custariam praticamente o mesmo",
}

const VERDICT_TONE: Record<AclComparisonVerdict, string> = {
    ACL_CHEAPER: "text-status-success",
    ACR_CHEAPER: "text-status-danger",
    EQUIVALENT: "text-muted",
}

/**
 * Comparação ACR × ACL — responde "vale a pena estar no mercado livre?" a
 * partir do consumo real medido, recalculado nos dois cenários para o
 * mesmo período. Só disponível para propriedade já em ACL com contrato
 * cadastrado cobrindo o período escolhido (ver `ConsumptionService.compareAclToAcr`
 * no backend — a ferramenta é retrospectiva, não uma simulação prévia para
 * quem ainda está no cativo).
 *
 * Dispatcher sem hooks próprios (mesmo padrão de `ConsumptionSection`): a
 * página resolve a propriedade primeiro e só entra no corpo real
 * (`AclComparisonContent`, que tem seus próprios hooks — a janela de
 * período e a query de comparação) depois que ela existe e está em ACL.
 */
export const AclComparisonPage = () => {
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

    if (property.contractingEnvironment !== "ACL") {
        return (
            <div className="flex flex-col gap-6">
                <BackLink propertyId={property.id} />
                <EmptyState
                    icon={Scale}
                    title="Disponível só para propriedades no Mercado Livre (ACL)"
                    description={`${property.name} está no ambiente cativo (ACR). Marque a propriedade como ACL e cadastre o contrato de energia para comparar.`}
                    action={
                        <Button asChild variant="secondary">
                            <Link to={`/propriedades/${property.id}`}>Ir para a propriedade</Link>
                        </Button>
                    }
                />
            </div>
        )
    }

    return <AclComparisonContent propertyId={property.id} propertyName={property.name} />
}

interface AclComparisonContentProps {
    propertyId: string
    propertyName: string
}

const AclComparisonContent = ({ propertyId, propertyName }: AclComparisonContentProps) => {
    const [range, setRange] = useState(defaultMonthRange)
    const from = fromMonthInputValue(range.from)
    const to = fromMonthInputValue(range.to)
    const comparisonQuery = useAclComparison(propertyId, from, to)

    return (
        <div className="flex flex-col gap-6">
            <BackLink propertyId={propertyId} />

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="font-heading text-[clamp(22px,2.4vw,28px)] leading-none font-semibold uppercase">
                        Comparação ACR × ACL
                    </h1>
                    <p className="text-muted mt-2 max-w-[60ch] text-sm">
                        {propertyName} — custo real recalculado nos dois cenários (cativo e Mercado
                        Livre) para o mesmo consumo medido.
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
                    <ComparisonCaveats />
                    <MonthsTable months={comparisonQuery.data.months} />
                    {comparisonQuery.data.pldContext.length > 0 && (
                        <PldContextTable pldContext={comparisonQuery.data.pldContext} />
                    )}
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
        totalAcrBrl: number
        totalAclBrl: number
        totalDiffBrl: number
        diffPercent: number
        verdict: AclComparisonVerdict
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
            <Stat label="Total no cativo (ACR)" value={formatBrl(comparison.totalAcrBrl)} />
            <Stat label="Total no Mercado Livre (ACL)" value={formatBrl(comparison.totalAclBrl)} />
            <Stat label="Diferença" value={formatBrl(Math.abs(comparison.totalDiffBrl))} accent />
            <Stat
                label="Percentual"
                value={formatPercent(Math.abs(comparison.diffPercent) / 100)}
                accent
            />
        </div>
    </Blueprint>
)

/**
 * Cortes de execução do cálculo, explicitados ao lado do veredito para não
 * passar a falsa impressão de precisão total — a comparação é uma
 * aproximação útil, não uma fatura.
 */
const ComparisonCaveats = () => (
    <ul className="text-muted flex list-none flex-col gap-1 text-xs">
        <li>
            · A bandeira tarifária aplicada ao cenário cativo (ACR) é a vigente hoje, para todos os
            meses do período — não há reconstituição do histórico de bandeira mês a mês.
        </li>
        <li>
            · O volume contratado do contrato ACL não entra no cálculo: o custo do Mercado Livre usa
            o consumo medido × a TE contratada, sem o mecanismo de take-or-pay real do mercado
            (diferença entre consumo e volume contratado liquidada ao PLD).
        </li>
    </ul>
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
    months: { monthStart: string; acrBrl: number; aclBrl: number; diffBrl: number }[]
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
                            Cativo (ACR)
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                            Mercado Livre (ACL)
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
                                {formatBrl(month.acrBrl)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {formatBrl(month.aclBrl)}
                            </td>
                            <td
                                className={`px-4 py-3 text-right font-mono tabular-nums ${resolveDiffToneClass(month.diffBrl)}`}
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

interface PldContextTableProps {
    pldContext: { id: string; submarket: string; referencePeriod: string; valuePerMwh: number }[]
}

/** PLD do período — contexto informativo, nunca insumo da fórmula de custo (mostrado à parte, sem se misturar com os totais acima). */
const PldContextTable = ({ pldContext }: PldContextTableProps) => (
    <Blueprint className="p-0">
        <div className="border-divider border-b px-5 py-4">
            <h2 className="font-heading text-17 font-semibold uppercase">
                PLD do período <Tag variant="outline">Contexto informativo</Tag>
            </h2>
            <p className="text-muted text-12-5 mt-1">
                Preço de Liquidação das Diferenças do submercado do contrato — não entra no cálculo
                do custo acima.
            </p>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-surface">
                    <tr className="text-muted text-left text-xs tracking-wide uppercase">
                        <th scope="col" className="px-4 py-3 font-medium">
                            Período
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                            Submercado
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                            PLD
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-divider divide-y">
                    {pldContext.map((quote) => (
                        <tr key={quote.id} className="text-text">
                            <td className="px-4 py-3">
                                {formatBucketLabel(quote.referencePeriod, "month")}
                            </td>
                            <td className="px-4 py-3">
                                {ACL_SUBMARKET_LABELS[
                                    quote.submarket as keyof typeof ACL_SUBMARKET_LABELS
                                ] ?? quote.submarket}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {formatBrl(quote.valuePerMwh)}/MWh
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </Blueprint>
)
