import { useState } from "react"
import { Link } from "react-router-dom"
import { Plus, Home, AlertCircle } from "lucide-react"
import { useProperties } from "@/hooks/queries/useProperties"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { PropertyCard } from "@/components/property/PropertyCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"
import { Pagination } from "@/components/ui/Pagination"
import { cn } from "@/lib/cn"
import type { Distributor } from "@/types/distributor.types"

/**
 * Lista de propriedades do usuário autenticado (paginada — Fase 5).
 *
 * Estados visuais:
 *   - Loading inicial — quando QUALQUER das duas queries
 *     (properties OU distributors) está carregando
 *   - Erro — mensagem da primeira query que falhou + botão tentar novamente
 *   - Vazio — EmptyState com CTA para criar a primeira propriedade
 *   - Sucesso — grid de cards com nome da distribuidora resolvido
 *
 * Por que duas queries em paralelo?
 *   PropertyCard precisa do NOME da distribuidora pra exibir o badge,
 *   mas Property só tem distributorId. Resolvemos no pai (aqui) montando
 *   um Map<id, name> e passando pro card. O catálogo de distribuidoras é
 *   pequeno (dezenas), então buscamos com pageSize máximo (31) para cobrir
 *   o catálogo inteiro numa única página em vez de paginar essa resolução.
 */
export const PropertiesPage = () => {
    const [page, setPage] = useState(1)
    const propertiesQuery = useProperties(page)
    const distributorsQuery = useDistributors(1, 31)

    const isLoading = propertiesQuery.isLoading || distributorsQuery.isLoading
    const isError = propertiesQuery.isError || distributorsQuery.isError

    const errorMessage = pickErrorMessage(
        propertiesQuery.error,
        distributorsQuery.error,
    )

    const handleRetry = () => {
        if (propertiesQuery.isError) propertiesQuery.refetch()
        if (distributorsQuery.isError) distributorsQuery.refetch()
    }

    const distributorMap = buildDistributorMap(distributorsQuery.data?.items ?? [])

    const properties = propertiesQuery.data?.items
    const hasNoProperties = !isLoading && !isError && properties && properties.length === 0
    const hasProperties = !isLoading && !isError && properties && properties.length > 0

    return (
        <div className="flex flex-col gap-6">
            {/* Header da página */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        Propriedades
                    </h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Gerencie as propriedades vinculadas à sua conta.
                    </p>
                </div>
                <Button asChild>
                    <Link to="/propriedades/nova">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Nova propriedade
                    </Link>
                </Button>
            </div>

            {/* Conteúdo principal */}
            {isLoading && <PropertyListSkeleton />}

            {!isLoading && isError && (
                <ErrorState message={errorMessage} onRetry={handleRetry} />
            )}

            {hasNoProperties && (
                <EmptyState
                    icon={Home}
                    title="Nenhuma propriedade cadastrada"
                    description="Cadastre sua primeira propriedade para começar a monitorar o consumo de energia."
                    action={
                        <Button asChild>
                            <Link to="/propriedades/nova">
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Cadastrar primeira propriedade
                            </Link>
                        </Button>
                    }
                />
            )}

            {hasProperties && (
                <>
                    <div
                        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                        data-testid="properties-grid"
                    >
                        {properties.map((property) => (
                            <PropertyCard
                                key={property.id}
                                property={property}
                                distributorName={
                                    distributorMap.get(property.distributorId) ??
                                    "Distribuidora removida"
                                }
                            />
                        ))}
                    </div>
                    <Pagination
                        page={propertiesQuery.data!.page}
                        pageSize={propertiesQuery.data!.pageSize}
                        total={propertiesQuery.data!.total}
                        onPageChange={setPage}
                    />
                </>
            )}
        </div>
    )
}

// Helpers

const buildDistributorMap = (
    distributors: Distributor[],
): Map<string, string> => {
    const map = new Map<string, string>()
    distributors.forEach((d) => map.set(d.id, d.name))
    return map
}

/**
 * Escolhe a mensagem de erro mais relevante.
 * Prioridade: erro de properties > erro de distributors.
 */
const pickErrorMessage = (
    propertiesError: unknown,
    distributorsError: unknown,
): string => {
    if (propertiesError instanceof Error) return propertiesError.message
    if (distributorsError instanceof Error) return distributorsError.message
    return "Erro ao carregar propriedades"
}

// Subcomponentes locais

const PropertyListSkeleton = () => (
    <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-busy="true"
        aria-label="Carregando propriedades"
    >
        {[0, 1, 2].map((i) => (
            <div
                key={i}
                className={cn(
                    "h-44 animate-pulse rounded-lg border bg-white p-5",
                    "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                )}
            >
                <div className="flex gap-3">
                    <div className="h-10 w-10 rounded-md bg-slate-200 dark:bg-slate-800" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
                    </div>
                </div>
                <div className="mt-6 h-6 w-32 rounded-full bg-slate-200 dark:bg-slate-800" />
            </div>
        ))}
    </div>
)

interface ErrorStateProps {
    message: string
    onRetry: () => void
}

const ErrorState = ({ message, onRetry }: ErrorStateProps) => (
    <div
        role="alert"
        className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 py-12 text-center",
            "dark:border-red-900 dark:bg-red-950/30",
        )}
    >
        <AlertCircle
            className="h-8 w-8 text-red-500 dark:text-red-400"
            aria-hidden="true"
        />
        <div>
            <h3 className="font-semibold text-red-900 dark:text-red-200">
                Não foi possível carregar
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {message}
            </p>
        </div>
        <Button onClick={onRetry} variant="secondary">
            Tentar novamente
        </Button>
    </div>
)
