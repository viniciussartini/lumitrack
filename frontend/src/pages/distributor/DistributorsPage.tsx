import { useState } from "react"
import { Search, Zap, AlertCircle } from "lucide-react"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { DistributorCard } from "@/components/distributor/DistributorCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"
import type { Distributor } from "@/types/distributor.types"

const matchesQuery = (distributor: Distributor, query: string): boolean => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
        distributor.name.toLowerCase().includes(q) ||
        distributor.cnpj.toLowerCase().includes(q) ||
        distributor.state.toLowerCase().includes(q)
    )
}

const ALL_STATES = "ALL"

/**
 * Catálogo global de distribuidoras — somente leitura (Fase 3/5).
 * Populado via seed; sem CRUD pelo usuário (sem dono, sem create/edit/delete).
 *
 * Sem paginação: o catálogo é pequeno (~dezenas), então buscamos tudo de uma
 * vez (`useDistributors(1, 31)`, mesmo idioma de `PropertiesPage.tsx`) e
 * filtramos em memória por busca (nome/CNPJ/UF) e por UF — conforme o bloco
 * `isDist` do handoff, que não pagina.
 */
export const DistribuidorsPage = () => {
    const { data, isLoading, isError, error, refetch } = useDistributors(1, 31)
    const [query, setQuery] = useState("")
    const [selectedState, setSelectedState] = useState(ALL_STATES)

    const distributors = data?.items ?? []

    const states = [ALL_STATES, ...Array.from(new Set(distributors.map((d) => d.state))).sort()]

    const filtered = distributors.filter(
        (d) => (selectedState === ALL_STATES || d.state === selectedState) && matchesQuery(d, query),
    )

    const hasNoDistributors = !isLoading && !isError && distributors.length === 0
    const hasNoResults = !isLoading && !isError && distributors.length > 0 && filtered.length === 0
    const hasResults = !isLoading && !isError && filtered.length > 0

    return (
        <div className="flex flex-col gap-6">
            <div>
                <span className="font-heading text-accent-700 block text-xs font-semibold tracking-[.08em] uppercase">
                    Catálogo
                </span>
                <h1 className="font-heading mt-2 text-[clamp(22px,2.4vw,30px)] leading-[1.05] font-semibold uppercase">
                    Distribuidoras
                </h1>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4">
                <p className="text-muted m-0 max-w-[70ch] text-sm">
                    Catálogo de distribuidoras disponíveis para vincular às propriedades. Tarifação do
                    Grupo B: <span className="text-accent-700 font-semibold">TUSD + TE</span> com
                    tributos por dentro.
                </p>
                <div className="relative flex shrink-0 items-center">
                    <Search
                        className="text-muted pointer-events-none absolute left-[13px] h-4 w-4"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        className="lt-search"
                        placeholder="Buscar distribuidora…"
                        aria-label="Buscar distribuidora"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
            </div>

            {!isLoading && !isError && distributors.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-muted mr-1 text-[11px] font-semibold tracking-[.08em] uppercase">
                        Estado
                    </span>
                    {states.map((state) => (
                        <button
                            key={state}
                            type="button"
                            className="lt-selbtn"
                            data-on={selectedState === state}
                            onClick={() => setSelectedState(state)}
                        >
                            {state === ALL_STATES ? "Todos" : state}
                        </button>
                    ))}
                </div>
            )}

            {isLoading && <DistributorListSkeleton />}

            {!isLoading && isError && (
                <ErrorState
                    message={
                        error instanceof Error
                            ? error.message
                            : "Erro ao carregar distribuidoras"
                    }
                    onRetry={() => refetch()}
                />
            )}

            {hasNoDistributors && (
                <EmptyState
                    icon={Zap}
                    title="Catálogo indisponível"
                    description="Não há distribuidoras cadastradas no momento."
                />
            )}

            {hasNoResults && (
                <EmptyState
                    icon={Zap}
                    title="Nenhuma distribuidora encontrada"
                    description="Ajuste a busca ou o filtro de estado."
                />
            )}

            {hasResults && (
                <div
                    className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-[clamp(14px,1.6vw,20px)]"
                    data-testid="distributors-grid"
                >
                    {filtered.map((distributor) => (
                        <DistributorCard key={distributor.id} distributor={distributor} />
                    ))}
                </div>
            )}
        </div>
    )
}

// Subcomponentes locais

const DistributorListSkeleton = () => (
    <div
        className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-[clamp(14px,1.6vw,20px)]"
        aria-busy="true"
        aria-label="Carregando distribuidoras"
    >
        {[0, 1, 2].map((i) => (
            <div key={i} className="blueprint h-44 animate-pulse p-5">
                <div className="flex gap-[13px]">
                    <div className="border-divider h-11 w-11 border" />
                    <div className="flex-1 space-y-2">
                        <div className="bg-divider h-4 w-2/3" />
                        <div className="bg-divider h-3 w-1/2" />
                    </div>
                </div>
                <div className="mt-6 space-y-2">
                    <div className="bg-divider h-3 w-full" />
                    <div className="bg-divider h-3 w-3/4" />
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
