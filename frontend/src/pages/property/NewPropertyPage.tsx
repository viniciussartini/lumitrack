import { Link, useNavigate } from "react-router"
import { ArrowLeft, AlertCircle, Zap } from "lucide-react"
import { toast } from "sonner"
import { PropertyForm } from "@/components/property/PropertyForm"
import { useCreateProperty } from "@/hooks/queries/usePropertyMutations"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { PropertyFormData } from "@/schemas/property.schema"
import type { CreatePropertyInput } from "@/types/property.types"

/**
 * Página de cadastro de nova propriedade.
 *
 * Estados:
 *   - Carregando distribuidoras → skeleton
 *   - Erro ao carregar distribuidoras → ErrorState
 *   - Sem distribuidoras cadastradas → empty state com CTA pra cadastrar
 *   - OK → renderiza PropertyForm
 *
 * Toda propriedade precisa estar vinculada a uma distribuidora.
 * É mostrado o empty state para evitar que o usuário preencha o formulário
 * e ao salvar receba o erro de "distribuidora não encontrada".
 *
 * Conversão no submit:
 *   - undefined em campos opcionais é OMITIDO do payload (não envia null)
 *     para casar com o backend que faz `data.address ?? null` no create.
 */
export const NewPropertyPage = () => {
    const navigate = useNavigate()
    const createMutation = useCreateProperty()
    // pageSize 31 (máximo) cobre o catálogo inteiro numa única página —
    // o form precisa de todas as distribuidoras disponíveis no select.
    const distributorsQuery = useDistributors(1, 31)

    const handleSubmit = async (data: PropertyFormData) => {
        const payload: CreatePropertyInput = {
            distributorId: data.distributorId,
            name: data.name,
            electricalSystem: data.electricalSystem,
            billingClass: data.billingClass,
            ...(data.address !== undefined && { address: data.address }),
            ...(data.city !== undefined && { city: data.city }),
            ...(data.state !== undefined && { state: data.state }),
            ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
            ...(data.publicLightingFeeBrl !== undefined && {
                publicLightingFeeBrl: data.publicLightingFeeBrl,
            }),
        }

        try {
            await createMutation.mutateAsync(payload)
            navigate("/propriedades", { replace: true })
        } catch (error) {
            // Toast de sucesso é disparado pelo hook. Aqui só erro.
            toast.error("Erro ao criar propriedade", {
                description: extractErrorMessage(error),
            })
        }
    }

    const distributors = distributorsQuery.data?.items ?? []
    const hasNoDistributors =
        !distributorsQuery.isLoading &&
        !distributorsQuery.isError &&
        distributors.length === 0

    return (
        <div className="flex flex-col gap-6">
            {/* Breadcrumb / voltar */}
            <Link
                to="/propriedades"
                className={cn(
                    "inline-flex w-fit items-center gap-1 text-sm",
                    "text-slate-600 hover:text-slate-900",
                    "dark:text-slate-400 dark:hover:text-slate-200",
                )}
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar para propriedades
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Nova propriedade
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Cadastre uma propriedade vinculada a uma distribuidora.
                </p>
            </div>

            {/* Estados */}
            {distributorsQuery.isLoading && <FormSkeleton />}

            {distributorsQuery.isError && (
                <ErrorState
                    message={
                        distributorsQuery.error instanceof Error
                            ? distributorsQuery.error.message
                            : "Erro ao carregar distribuidoras"
                    }
                />
            )}

            {hasNoDistributors && (
                <EmptyState
                    icon={Zap}
                    title="Catálogo de distribuidoras indisponível"
                    description="Toda propriedade precisa estar vinculada a uma distribuidora do catálogo. Tente novamente em instantes."
                    action={
                        <Button asChild variant="secondary">
                            <Link to="/distribuidoras">Ver catálogo de distribuidoras</Link>
                        </Button>
                    }
                />
            )}

            {!distributorsQuery.isLoading &&
                !distributorsQuery.isError &&
                distributors.length > 0 && (
                    <div
                        className={cn(
                            "rounded-lg border bg-white p-6 shadow-sm",
                            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                        )}
                    >
                        <PropertyForm
                            distributors={distributors}
                            onSubmit={handleSubmit}
                            onCancel={() => navigate("/propriedades")}
                            submitLabel="Cadastrar propriedade"
                        />
                    </div>
                )}
        </div>
    )
}

// Subcomponentes locais

const FormSkeleton = () => (
    <div
        className={cn(
            "h-96 animate-pulse rounded-lg border bg-white p-6",
            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
        )}
        aria-busy="true"
        aria-label="Carregando dados"
    />
)

interface ErrorStateProps {
    message: string
}

const ErrorState = ({ message }: ErrorStateProps) => (
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
        <Button asChild variant="secondary">
            <Link to="/propriedades">Voltar para a lista</Link>
        </Button>
    </div>
)