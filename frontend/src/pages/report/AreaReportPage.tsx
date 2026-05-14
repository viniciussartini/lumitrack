// frontend/src/pages/report/AreaReportPage.tsx

import { Link, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, FileBarChart, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/cn"
import { useArea } from "@/hooks/queries/useAreas"
import { useReportByArea } from "@/hooks/queries/useReport"
import { ReportView } from "@/components/report/ReportView"
import {
    parseReportFiltersFromParams,
    serializeReportFiltersToParams,
} from "@/pages/report/reportFiltersUrl"
import type { ReportFilters } from "@/types/report.types"

/**
 * Página de relatório de uma área.
 *
 * Rota: /propriedades/:propertyId/areas/:areaId/relatorio
 *
 * Espelha PropertyReportPage com 3 diferenças:
 *   1. Lê 2 params da rota (propertyId, areaId) em vez de 1
 *   2. Usa useReportByArea + useArea
 *   3. EntityLabel "desta área", BackLink volta pra AreaDetails
 *
 * Mantemos a página separada (em vez de uma única ReportPage discriminada)
 * porque cada rota tem URL distinta, tipos de useParams diferentes, e o
 * link de voltar muda — extrair tudo num componente único exigiria props
 * intermediárias que duplicariam a lógica de qualquer jeito.
 */
export const AreaReportPage = () => {
    const { propertyId, areaId } = useParams<{
        propertyId: string
        areaId: string
    }>()
    const [searchParams, setSearchParams] = useSearchParams()

    const filters: ReportFilters = parseReportFiltersFromParams(searchParams, {
        period: "MONTHLY",
    })

    const handleFiltersChange = (next: ReportFilters) => {
        setSearchParams(serializeReportFiltersToParams(next), {
            replace: true,
        })
    }

    const areaQuery = useArea(propertyId, areaId)
    const reportQuery = useReportByArea(propertyId, areaId, filters)

    const areaName =
        areaQuery.data?.name ??
        (areaQuery.isLoading ? "Carregando..." : "Área")

    return (
        <div className="flex flex-col gap-6">
            <BackLink propertyId={propertyId} areaId={areaId} />

            <header className="flex items-start gap-3">
                <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
                    aria-hidden="true"
                >
                    <FileBarChart className="h-6 w-6 text-brand-500" />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
                        Relatório de consumo
                    </h1>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                        <LayoutGrid
                            className="h-4 w-4 shrink-0"
                            aria-hidden={true}
                        />
                        <span className="truncate">{areaName}</span>
                    </p>
                </div>
            </header>

            <ReportView
                query={reportQuery}
                filters={filters}
                onFiltersChange={handleFiltersChange}
                entityLabel={{ artigo: "desta", nome: "área" }}
            />
        </div>
    )
}

interface BackLinkProps {
    propertyId: string | undefined
    areaId: string | undefined
}

const BackLink = ({ propertyId, areaId }: BackLinkProps) => {
    const href =
        propertyId && areaId
            ? `/propriedades/${propertyId}/areas/${areaId}`
            : propertyId
                ? `/propriedades/${propertyId}`
                : "/propriedades"

    return (
        <Link
            to={href}
            className={cn(
                "inline-flex w-fit items-center gap-1 text-sm",
                "text-slate-600 hover:text-slate-900",
                "dark:text-slate-400 dark:hover:text-slate-200",
            )}
        >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para área
        </Link>
    )
}