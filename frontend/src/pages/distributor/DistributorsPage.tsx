import { Link } from "react-router-dom"
import { Plus, Zap, AlertCircle } from "lucide-react"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { DistributorCard } from "@/components/distributor/DistributorCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/cn"

/**
 * Lista de distribuidoras do usuário autenticado.
 *
 * Estados visuais:
 *   - Loading inicial (skeleton de 3 cards)
 *   - Erro (mensagem + botão tentar novamente — TanStack Query refetch)
 *   - Vazio (EmptyState com CTA para criar a primeira)
 *   - Sucesso (grid de cards)
 *
 * O botão "Nova distribuidora" sempre aparece no header — leva pra
 * rota /distribuidoras/nova
 */
export const DistribuidorsPage = () => {
    const { data, isLoading, isError, error, refetch } = useDistributors()

    return (
        <div className="flex flex-col gap-6">
            {/* Header da página */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        Distribuidoras
                    </h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Gerencie as distribuidoras de energia vinculadas à sua conta.
                    </p>
                </div>
                <Button asChild>
                    <Link to="/distribuidoras/nova">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Nova distribuidora
                    </Link>
                </Button>
            </div>

            {/* Conteúdo principal */}
            {isLoading && <DistributorListSkeleton />}

            {isError && (
                <ErrorState
                    message={
                        error instanceof Error
                            ? error.message
                            : "Erro ao carregar distribuidoras"
                    }
                    onRetry={() => refetch()}
                />
            )}

            {!isLoading && !isError && data && data.length === 0 && (
                <EmptyState
                    icon={Zap}
                    title="Nenhuma distribuidora cadastrada"
                    description="Cadastre sua primeira distribuidora para começar a monitorar o consumo de energia das suas propriedades."
                    action={
                        <Button asChild>
                            <Link to="/distribuidoras/nova">
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Cadastrar primeira distribuidora
                            </Link>
                        </Button>
                    }
                />
            )}

            {!isLoading && !isError && data && data.length > 0 && (
                <div
                    className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                    data-testid="distributors-grid"
                >
                    {data.map((distributor) => (
                        <DistributorCard
                            key={distributor.id}
                            distributor={distributor}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// Subcomponentes locais

const DistributorListSkeleton = () => (
    <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-busy="true"
        aria-label="Carregando distribuidoras"
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
                <div className="mt-6 space-y-2">
                    <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
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
        className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 py-12 text-center",
            "dark:border-red-900 dark:bg-red-950/30",
        )}
    >
        <AlertCircle
            className="h-8 w-8 text-red-500 dark:text-red-400"
            aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-red-900 dark:text-red-200">
                Não foi possível carregar
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
        </div>
        <Button variant="secondary" onClick={onRetry}>
            Tentar novamente
        </Button>
    </div>
)