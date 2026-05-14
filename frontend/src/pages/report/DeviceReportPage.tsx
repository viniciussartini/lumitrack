import { Link, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Cpu, FileBarChart } from "lucide-react"
import { cn } from "@/lib/cn"
import { useDevice } from "@/hooks/queries/useDevices"
import { useReportByDevice } from "@/hooks/queries/useReport"
import { ReportView } from "@/components/report/ReportView"
import {
    parseReportFiltersFromParams,
    serializeReportFiltersToParams,
} from "@/pages/report/reportFiltersUrl"
import type { ReportFilters } from "@/types/report.types"

/**
 * Página de relatório de um dispositivo.
 *
 * Rota: /propriedades/:propertyId/areas/:areaId/devices/:deviceId/relatorio
 *
 * Espelha AreaReportPage com:
 *   - 3 params da rota
 *   - useReportByDevice + useDevice
 *   - "deste dispositivo" no entityLabel
 *
 * Default period DAILY?
 *   Considerei mudar o default só pra device (dispositivos costumam ter
 *   consumo mais granular). Mas trocar o default sem o usuário pedir vira
 *   surpresa — e o filtro está SEMPRE visível, ele troca em 1 click.
 *   Mantive MONTHLY em todas as 3 páginas pra previsibilidade.
 */
export const DeviceReportPage = () => {
    const { propertyId, areaId, deviceId } = useParams<{
        propertyId: string
        areaId: string
        deviceId: string
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

    const deviceQuery = useDevice(propertyId, areaId, deviceId)
    const reportQuery = useReportByDevice(
        propertyId,
        areaId,
        deviceId,
        filters,
    )

    const deviceName =
        deviceQuery.data?.name ??
        (deviceQuery.isLoading ? "Carregando..." : "Dispositivo")

    return (
        <div className="flex flex-col gap-6">
            <BackLink
                propertyId={propertyId}
                areaId={areaId}
                deviceId={deviceId}
            />

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
                        <Cpu
                            className="h-4 w-4 shrink-0"
                            aria-hidden={true}
                        />
                        <span className="truncate">{deviceName}</span>
                    </p>
                </div>
            </header>

            <ReportView
                query={reportQuery}
                filters={filters}
                onFiltersChange={handleFiltersChange}
                entityLabel={{ artigo: "deste", nome: "dispositivo" }}
            />
        </div>
    )
}

interface BackLinkProps {
    propertyId: string | undefined
    areaId: string | undefined
    deviceId: string | undefined
}

const BackLink = ({ propertyId, areaId, deviceId }: BackLinkProps) => {
    const href =
        propertyId && areaId && deviceId
            ? `/propriedades/${propertyId}/areas/${areaId}/devices/${deviceId}`
            : propertyId && areaId
                ? `/propriedades/${propertyId}/areas/${areaId}`
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
            Voltar para dispositivo
        </Link>
    )
}