import type { ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { ComparisonCard } from "@/components/consumption/ComparisonCard"
import type { ComparisonRow } from "@/components/consumption/ComparisonBars"
import { useConsumptionSummary } from "@/hooks/queries/useConsumption"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"
import type { TargetType } from "@/types/meter.types"

interface ComparisonMessageProps {
    title: string
    children: ReactNode
    isError?: boolean
}

const ComparisonMessage = ({ title, children, isError }: ComparisonMessageProps) => (
    <Blueprint className="p-0">
        <div className="border-divider border-b px-5 py-4">
            <span className="font-heading text-17 font-semibold uppercase">{title}</span>
        </div>
        <p
            role={isError ? "alert" : undefined}
            className={
                isError
                    ? "text-status-danger m-0 flex items-center gap-2 px-5 py-4 text-sm"
                    : "text-muted m-0 px-5 py-4 text-sm"
            }
        >
            {isError && <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {children}
        </p>
    </Blueprint>
)

interface Nouns {
    singular: string
    plural: string
}

const omittedNotice = (omitted: number, nouns: Nouns) =>
    omitted === 1
        ? `1 ${nouns.singular} sem medidor não aparece na comparação.`
        : `${omitted} ${nouns.plural} sem medidor não aparecem na comparação.`

/** Avisos sob as barras: quantos itens a página cortou e quantos ficaram de fora por falta de medidor. */
const buildNotices = (
    listLength: number,
    total: number | undefined,
    omitted: number,
    nouns: Nouns,
): string | undefined => {
    const notices = [
        total !== undefined && total > listLength
            ? `Comparando ${listLength} de ${total} ${nouns.plural}.`
            : undefined,
        omitted > 0 ? omittedNotice(omitted, nouns) : undefined,
    ].filter((text) => text !== undefined)

    return notices.length > 0 ? notices.join(" ") : undefined
}

/** Uma linha por item que o resumo devolveu — os sem medidor não têm bucket. */
const toRows = (
    targets: { id: string; name: string }[],
    items: ConsumptionSummaryItem[] | undefined,
): ComparisonRow[] => {
    const bucketById = new Map((items ?? []).map((item) => [item.id, item]))
    return targets.flatMap((target): ComparisonRow[] => {
        const bucket = bucketById.get(target.id)
        return bucket ? [{ id: target.id, label: target.name, bucket }] : []
    })
}

interface TargetComparisonProps {
    targetType: TargetType
    title: string
    /** Recorte da comparação, sem a unidade — ex.: "Consumo por área neste mês". */
    subtitle: string
    /** Itens do nível abaixo, já listados pelo pai; `undefined` enquanto carrega. */
    targets: { id: string; name: string }[] | undefined
    /** Quantos itens o nível tem de verdade — maior que `targets` quando a página cortou. */
    total: number | undefined
    isListError: boolean
    /** Como chamar os itens no aviso de quem ficou de fora. */
    nouns: Nouns
    emptyMessage: string
    noMeterMessage: string
    errorMessage: string
    testId: string
}

/**
 * Comparação do consumo do mês entre os itens de um nível (áreas de uma
 * propriedade, dispositivos de uma área), numa única chamada ao resumo. Só
 * entram os que têm medidor — o resumo omite os demais — e o cartão diz
 * quantos ficaram de fora; sem nenhum, explica por quê em vez de sumir.
 */
export const TargetComparison = ({
    targetType,
    title,
    subtitle,
    targets,
    total,
    isListError,
    nouns,
    emptyMessage,
    noMeterMessage,
    errorMessage,
    testId,
}: TargetComparisonProps) => {
    const list = targets ?? []
    const summaryQuery = useConsumptionSummary(
        targetType,
        list.map((target) => target.id),
        "month",
    )

    if (isListError || summaryQuery.isError) {
        return (
            <ComparisonMessage title={title} isError>
                {errorMessage}
            </ComparisonMessage>
        )
    }
    if (targets === undefined || summaryQuery.isLoading) {
        return (
            <Blueprint className="p-0" aria-busy="true">
                <p role="status" className="text-muted m-0 animate-pulse px-5 py-6 text-sm">
                    Carregando {title.toLowerCase()}…
                </p>
            </Blueprint>
        )
    }
    if (list.length === 0)
        return <ComparisonMessage title={title}>{emptyMessage}</ComparisonMessage>

    const rows = toRows(list, summaryQuery.data?.items)
    if (rows.length === 0) {
        return <ComparisonMessage title={title}>{noMeterMessage}</ComparisonMessage>
    }

    const omitted = list.length - rows.length
    const notice = buildNotices(list.length, total, omitted, nouns)
    return (
        <ComparisonCard
            title={title}
            subtitle={subtitle}
            rows={rows}
            testId={testId}
            {...(notice !== undefined && { notice })}
        />
    )
}
