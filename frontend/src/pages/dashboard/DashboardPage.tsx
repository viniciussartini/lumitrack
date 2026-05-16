import { useAuth } from "@/contexts/AuthContext"
import { Link, useSearchParams } from "react-router-dom"
import { AlertCircle, Building2, Plus } from "lucide-react"
import { cn } from "@/lib/cn"
import { useDashboard } from "@/hooks/queries/useDashboard"
import { DashboardView } from "@/components/dashboard/DashboardView"
import { EmptyState } from "@/components/ui/EmptyState"
import {
    parseReportFiltersFromParams,
    serializeReportFiltersToParams,
} from "@/pages/report/reportFiltersUrl"
import { extractErrorMessage } from "@/services/api"
import type { ReportFilters } from "@/types/report.types"

/**
 * DashboardPage — visão agregada cross-propriedades.
 *
 * Rota: /dashboard
 * Query string sincronizada: ?period=MONTHLY&dateFrom=...&dateTo=...
 *
 * Responsabilidades:
 *   - extrair/sincronizar filtros com query string,
 *   - acionar useDashboard com os filtros,
 *   - decidir o que renderizar baseado nos estados:
 *       loadingProperties → skeleton
 *       errorProperties   → banner fatal
 *       sem propriedades  → empty state com CTA
 *       loading reports   → skeleton (mantém filtros visíveis pro user
 *                           poder cancelar ajustando o filtro)
 *       sucesso/parcial   → DashboardView
 *
 * URL sync deliberado em vez de useState:
 *   Mesmo argumento do /relatorio — compartilhamento por link, refresh
 *   preserva estado, navegação histórica.
 *
 * Default period MONTHLY:
 *   Igual ao /relatorio. É o caso de uso mais comum (ver consumo
 *   mensal) e produz uma quantidade saudável de pontos no eixo X
 *   (DAILY pode ficar denso, ANNUAL muito esparso).
 *
 * Reuso de parseReportFiltersFromParams / serializeReportFiltersToParams:
 *   O contrato de filtro do dashboard é IDÊNTICO ao do relatório
 *   individual. Reusar evita drift e mantém URL semanticamente igual.
 */

export const DashboardPage = () => {
    const { user } = useAuth()
    const [searchParams, setSearchParams] = useSearchParams()

    const filters: ReportFilters = parseReportFiltersFromParams(searchParams, {
        period: "MONTHLY",
    })

    const handleFiltersChange = (next: ReportFilters) => {
        setSearchParams(serializeReportFiltersToParams(next), {
            replace: true,
        })
    }

    const {
        propertiesQuery,
        dashboardData,
        isLoadingProperties,
        isLoadingReports,
        isErrorProperties,
        isPartial,
        errorCount,
    } = useDashboard({ filters })

    const greeting = user?.firstName
        ? `Olá, ${user.firstName}!`
        : user?.companyName
            ? `Olá, ${user.tradeName ?? user.companyName}!`
            : "Olá!"

    return (
        <div className="flex flex-col gap-6">
            <header>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {greeting}
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Visão consolidada do consumo das suas propriedades.
                </p>
            </header>

            {/* Erro fatal — falha ao listar propriedades */}
            {isErrorProperties && (
                <div
                    role="alert"
                    data-testid="dashboard-error"
                    className={cn(
                        "flex items-start gap-3 rounded-lg border p-4",
                        "border-red-200 bg-red-50 text-red-900",
                        "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
                    )}
                >
                    <AlertCircle
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                    />
                    <p className="text-sm">
                        {extractErrorMessage(propertiesQuery.error)}
                    </p>
                </div>
            )}

            {/* Loading — só properties */}
            {isLoadingProperties && <DashboardSkeleton />}

            {/* User sem propriedades — CTA pra cadastrar a primeira */}
            {!isErrorProperties &&
                !isLoadingProperties &&
                (propertiesQuery.data?.length ?? 0) === 0 && (
                    <EmptyState
                        icon={Building2}
                        title="Você ainda não tem propriedades cadastradas"
                        description="Cadastre sua primeira propriedade para começar a acompanhar o consumo de energia."
                        action={
                            <Link
                                to="/propriedades/nova"
                                className={cn(
                                    "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
                                    "bg-brand-600 text-white shadow-sm transition-colors",
                                    "hover:bg-brand-700",
                                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                                    "dark:focus-visible:ring-offset-slate-950",
                                )}
                                data-testid="dashboard-cta-create-property"
                            >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Cadastrar primeira propriedade
                            </Link>
                        }
                    />
                )}

            {/* Loading — properties OK, mas reports ainda chegando */}
            {!isErrorProperties &&
                propertiesQuery.isSuccess &&
                (propertiesQuery.data?.length ?? 0) > 0 &&
                dashboardData === null &&
                isLoadingReports && <DashboardSkeleton />}

            {/* Conteúdo principal */}
            {dashboardData !== null &&
                (propertiesQuery.data?.length ?? 0) > 0 && (
                    <DashboardView
                        data={dashboardData}
                        filters={filters}
                        onFiltersChange={handleFiltersChange}
                        isPartial={isPartial}
                        errorCount={errorCount}
                        isRefetching={
                            isLoadingReports && dashboardData !== null
                        }
                    />
                )}
        </div>
    )
}

/**
 * Skeleton placeholder usado em ambos os carregamentos (lista de
 * propriedades + lista de reports). Mantém o esqueleto da página
 * pronto enquanto a infra carrega — reduz o "salto" visual quando os
 * dados chegam.
 *
 * Inline aqui em vez de componente separado pois é trivial e só
 * usado nesta página.
 */
const DashboardSkeleton = () => (
    <div
        className="flex animate-pulse flex-col gap-4"
        data-testid="dashboard-skeleton"
        aria-hidden="true"
    >
        <div className="h-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="h-24 rounded-lg bg-slate-200 dark:bg-slate-800"
                />
            ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-72 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-72 rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
    </div>
)