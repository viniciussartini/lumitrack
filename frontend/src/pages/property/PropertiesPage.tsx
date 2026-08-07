import { useState } from "react"
import { Plus, Home, AlertCircle } from "lucide-react"
import { useProperties } from "@/hooks/queries/useProperties"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { PropertyCard } from "@/components/property/PropertyCard"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"
import { Pagination } from "@/components/ui/Pagination"
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
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const propertiesQuery = useProperties(page)
    const distributorsQuery = useDistributors(1, 31)

    const isLoading = propertiesQuery.isLoading || distributorsQuery.isLoading
    const isError = propertiesQuery.isError || distributorsQuery.isError

    const errorMessage = pickErrorMessage(propertiesQuery.error, distributorsQuery.error)

    const handleRetry = () => {
        if (propertiesQuery.isError) void propertiesQuery.refetch()
        if (distributorsQuery.isError) void distributorsQuery.refetch()
    }

    const distributorMap = buildDistributorMap(distributorsQuery.data?.items ?? [])

    const properties = propertiesQuery.data?.items
    const hasNoProperties = !isLoading && !isError && properties && properties.length === 0
    const hasProperties = !isLoading && !isError && properties && properties.length > 0

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted m-0 text-sm">
                    Gerencie as propriedades vinculadas à sua conta.
                </p>
                <Button onClick={() => setIsCreateOpen(true)} className="min-h-[42px]">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nova propriedade
                </Button>
            </div>

            {/* Conteúdo principal */}
            {isLoading && <PropertyListSkeleton />}

            {!isLoading && isError && <ErrorState message={errorMessage} onRetry={handleRetry} />}

            {hasNoProperties && (
                <EmptyState
                    icon={Home}
                    title="Nenhuma propriedade cadastrada"
                    description="Cadastre sua primeira propriedade para começar a monitorar o consumo de energia."
                    action={
                        <Button onClick={() => setIsCreateOpen(true)}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Cadastrar primeira propriedade
                        </Button>
                    }
                />
            )}

            {hasProperties && (
                <>
                    <div
                        className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[clamp(14px,1.6vw,20px)]"
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
                                distributors={distributorsQuery.data?.items ?? []}
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

            <PropertyFormDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                mode={{ kind: "create" }}
                distributors={distributorsQuery.data?.items ?? []}
                isDistributorsLoading={distributorsQuery.isLoading}
            />
        </div>
    )
}

// Helpers

const buildDistributorMap = (distributors: Distributor[]): Map<string, string> => {
    const map = new Map<string, string>()
    distributors.forEach((d) => map.set(d.id, d.name))
    return map
}

/**
 * Escolhe a mensagem de erro mais relevante.
 * Prioridade: erro de properties > erro de distributors.
 */
const pickErrorMessage = (propertiesError: unknown, distributorsError: unknown): string => {
    if (propertiesError instanceof Error) return propertiesError.message
    if (distributorsError instanceof Error) return distributorsError.message
    return "Erro ao carregar propriedades"
}

// Subcomponentes locais

const PropertyListSkeleton = () => (
    <div
        className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[clamp(14px,1.6vw,20px)]"
        aria-busy="true"
        aria-label="Carregando propriedades"
    >
        {[0, 1, 2].map((i) => (
            <div key={i} className="blueprint h-44 animate-pulse p-5">
                <div className="flex gap-[13px]">
                    <div className="border-divider h-10 w-10 border" />
                    <div className="flex-1 space-y-2">
                        <div className="bg-divider h-4 w-2/3" />
                        <div className="bg-divider h-3 w-1/2" />
                    </div>
                </div>
                <div className="mt-6 flex gap-2">
                    <div className="bg-divider h-5 w-16" />
                    <div className="bg-divider h-5 w-20" />
                    <div className="bg-divider h-5 w-24" />
                </div>
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
        className="border-status-danger/40 flex flex-col items-center justify-center gap-4 border py-12 text-center"
    >
        <AlertCircle className="text-status-danger h-8 w-8" aria-hidden="true" />
        <div>
            <h3 className="font-heading text-status-danger font-semibold uppercase">
                Não foi possível carregar
            </h3>
            <p className="text-status-danger/85 mt-1 text-sm">{message}</p>
        </div>
        <Button onClick={onRetry} variant="secondary">
            Tentar novamente
        </Button>
    </div>
)
