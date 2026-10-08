import axios from "axios"
import { DemandChart, CONTRACTED_COLOR, MEASURED_COLOR } from "@/components/dashboard/DemandChart"
import { SectionError, SectionSkeleton, SectionStat } from "@/components/dashboard/SectionParts"
import { Blueprint } from "@/components/ui/Blueprint"
import { useDemandOverview } from "@/hooks/queries/useDemandOverview"
import {
    describeContracted,
    describeExceedance,
    formatDemandKw,
    maxExceedsContracted,
} from "@/lib/demandOverview"
import type { DemandOverview } from "@/types/demand.types"

const MODALITY_LABELS = { GREEN: "Verde", BLUE: "Azul" } as const

interface DemandSectionProps {
    propertyId: string
    propertyName: string
}

/**
 * "Demanda atual vs. contratada" do Painel (LumiTrack Home v2.dc.html, Painel),
 * só para propriedade do Grupo A: os cards Demanda atual, Máxima do mês,
 * Contratada e Ultrapassagem, e o gráfico do dia com as linhas Medida e
 * Contratada. Janela sem medição aparece como "-", nunca 0 kW.
 *
 * Quem monta o bloco decide se a propriedade é do Grupo A; o servidor também
 * recusa as demais.
 */
export const DemandSection = ({ propertyId, propertyName }: DemandSectionProps) => {
    const query = useDemandOverview(propertyId)

    return (
        <Blueprint className="p-0" data-testid="demand-section">
            <DemandHeader propertyName={propertyName} modality={query.data?.modality} />
            {query.isLoading && (
                <SectionSkeleton label="Carregando demanda" testId="demand-skeleton" />
            )}
            {query.isError && !query.data && (
                <DemandProblem error={query.error} onRetry={() => void query.refetch()} />
            )}
            {query.data && <DemandBody overview={query.data} />}
        </Blueprint>
    )
}

interface DemandHeaderProps {
    propertyName: string
    modality: DemandOverview["modality"] | undefined
}

const DemandHeader = ({ propertyName, modality }: DemandHeaderProps) => (
    <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
            <span className="font-heading text-17 font-semibold uppercase">
                Demanda atual vs. contratada
            </span>
            <span className="text-muted text-12-5 mt-0.5 block">
                {propertyName}
                {modality && ` · modalidade ${MODALITY_LABELS[modality]}`} · medição a cada 15 min
            </span>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-4 p-0">
            <LegendItem color={MEASURED_COLOR} label="Medida" />
            <LegendItem color={CONTRACTED_COLOR} label="Contratada" />
        </ul>
    </div>
)

const DemandBody = ({ overview }: { overview: DemandOverview }) => {
    const exceedance = describeExceedance(overview.exceedancePercent)

    return (
        <>
            <dl
                className="border-divider m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] border-b"
                data-testid="demand-stats"
            >
                <SectionStat
                    size="md"
                    label="Demanda atual"
                    value={formatDemandKw(overview.current.kw)}
                />
                <SectionStat
                    size="md"
                    label="Máxima do mês"
                    value={formatDemandKw(overview.monthMax.kw)}
                    tone={
                        maxExceedsContracted(overview.monthMax, overview.contracted)
                            ? "danger"
                            : undefined
                    }
                />
                <SectionStat
                    size="md"
                    label="Contratada"
                    value={describeContracted(overview.contracted)}
                />
                <SectionStat
                    size="md"
                    label="Ultrapassagem"
                    value={exceedance.label}
                    tone={exceedance.tone}
                />
            </dl>
            <div className="p-5">
                <DemandChart points={overview.day.points} />
            </div>
        </>
    )
}

const LegendItem = ({ color, label }: { color: string; label: string }) => (
    <li className="text-12 inline-flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-3.5" style={{ backgroundColor: color }} />
        {label}
    </li>
)

/** Mensagem que o servidor mandou num erro de validação, para o usuário saber o que falta. */
const serverMessage = (error: unknown): string | undefined => {
    if (!axios.isAxiosError(error)) return undefined
    const data: unknown = error.response?.data
    if (typeof data !== "object" || data === null || !("message" in data)) return undefined
    return typeof data.message === "string" ? data.message : undefined
}

interface DemandProblemProps {
    error: unknown
    onRetry: () => void
}

/**
 * Sem medidor e contrato sem apuração (modalidade ou cadastro incompletos)
 * não são falha de rede: têm aviso próprio e nenhum "tentar novamente".
 */
const DemandProblem = ({ error, onRetry }: DemandProblemProps) => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined

    if (status === 404) {
        return (
            <p role="status" className="text-muted text-13 m-0 px-5 py-8 text-center">
                Configure um medidor na propriedade para acompanhar a demanda.
            </p>
        )
    }
    if (status === 422) {
        return (
            <p role="status" className="text-muted text-13 m-0 px-5 py-8 text-center">
                {serverMessage(error) ?? "A demanda deste contrato não está disponível no Painel."}
            </p>
        )
    }
    return <SectionError message="Não foi possível carregar a demanda." onRetry={onRetry} />
}
