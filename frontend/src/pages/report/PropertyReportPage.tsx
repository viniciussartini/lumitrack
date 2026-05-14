// frontend/src/pages/report/PropertyReportPage.tsx

import { Link, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, FileBarChart, Home } from "lucide-react"
import { cn } from "@/lib/cn"
import { useProperty } from "@/hooks/queries/useProperties"
import { useReportByProperty } from "@/hooks/queries/useReport"
import { ReportView } from "@/components/report/ReportView"
import {
    parseReportFiltersFromParams,
    serializeReportFiltersToParams,
} from "@/pages/report/reportFiltersUrl"
import type { ReportFilters } from "@/types/report.types"

/**
 * Página de relatório de uma propriedade.
 *
 * Rota: /propriedades/:id/relatorio
 * Query string sincronizada com filtros: ?period=MONTHLY&dateFrom=...&dateTo=...
 *
 * Responsabilidade:
 *   - extrair propertyId da URL,
 *   - extrair/sincronizar filtros com query string,
 *   - injetar tudo no ReportView (presentacional),
 *   - renderizar header próprio (título + link voltar + chip da propriedade pai).
 *
 * URL sync deliberado em vez de useState local:
 *   Compartilhar relatório por link "que abre exatamente o filtro" é um
 *   uso natural — usuário copia URL do navegador e cola no Slack/email.
 *   Mesma estratégia do AlertsPage (?triggered=true).
 *
 * Default period MONTHLY:
 *   Cobre o caso mais comum (ver conta do mês). DAILY enche a tabela com
 *   muitos registros; ANNUAL agrupa demais. MONTHLY é o "meio termo
 *   semântico" — também é o que o backend sugere implicitamente nos
 *   testes de simulação.
 *
 * Não carregamos a Property eagerly só pra mostrar o nome no header? Sim,
 * carregamos — é uma 2ª query rapida (cache potencialmente já quente da
 * página de Details) e é importante pro usuário saber em qual recurso
 * está. Loading state cai num placeholder no chip; erro não é fatal
 * (relatório segue funcionando, só o nome fica "Propriedade").
 */
export const PropertyReportPage = () => {
    const { id } = useParams<{ id: string }>()
    const [searchParams, setSearchParams] = useSearchParams()

    const filters: ReportFilters = parseReportFiltersFromParams(searchParams, {
        period: "MONTHLY",
    })

    const handleFiltersChange = (next: ReportFilters) => {
        setSearchParams(serializeReportFiltersToParams(next), {
            replace: true,
        })
    }

    const propertyQuery = useProperty(id)
    const reportQuery = useReportByProperty(id, filters)

    const propertyName =
        propertyQuery.data?.name ??
        (propertyQuery.isLoading ? "Carregando..." : "Propriedade")

    return (
        <div className="flex flex-col gap-6">
            <BackLink propertyId={id} />

            <ReportHeader
                title="Relatório de consumo"
                subtitleIcon={Home}
                subtitleLabel={propertyName}
            />

            <ReportView
                query={reportQuery}
                filters={filters}
                onFiltersChange={handleFiltersChange}
                entityLabel={{ artigo: "desta", nome: "propriedade" }}
            />
        </div>
    )
}

interface BackLinkProps {
    propertyId: string | undefined
}

const BackLink = ({ propertyId }: BackLinkProps) => (
    <Link
        to={propertyId ? `/propriedades/${propertyId}` : "/propriedades"}
        className={cn(
            "inline-flex w-fit items-center gap-1 text-sm",
            "text-slate-600 hover:text-slate-900",
            "dark:text-slate-400 dark:hover:text-slate-200",
        )}
    >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para propriedade
    </Link>
)

interface ReportHeaderProps {
    title: string
    subtitleIcon: React.ComponentType<{
        className?: string
        "aria-hidden"?: boolean
    }>
    subtitleLabel: string
}

/**
 * Header padrão das 3 páginas de relatório.
 *
 * Centralizado num componente local (não exportado) porque é trivial e
 * só repetiria em 3 lugares — extrair pra components/report/ seria
 * overengineering pra um JSX de ~15 linhas.
 */
const ReportHeader = ({
    title,
    subtitleIcon: SubIcon,
    subtitleLabel,
}: ReportHeaderProps) => (
    <header className="flex items-start gap-3">
        <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
            aria-hidden="true"
        >
            <FileBarChart className="h-6 w-6 text-brand-500" />
        </div>
        <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
                {title}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                <SubIcon className="h-4 w-4 shrink-0" aria-hidden={true} />
                <span className="truncate">{subtitleLabel}</span>
            </p>
        </div>
    </header>
)