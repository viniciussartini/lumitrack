import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { PropertyForm } from "@/components/property/PropertyForm"
import { useProperty } from "@/hooks/queries/useProperties"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { useUpdateProperty } from "@/hooks/queries/usePropertyMutations"
import { Button } from "@/components/ui/Button"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { PropertyFormData } from "@/schemas/property.schema"
import type { UpdatePropertyInput } from "@/types/property.types"

/**
 * Página de edição de propriedade.
 *
 * Carrega DUAS queries em paralelo:
 *   - useProperty(id): a propriedade sendo editada
 *   - useDistributors(): pra popular o select (usuário pode trocar de distribuidora)
 *
 * Estados:
 *   - Loading inicial (qualquer das duas queries) → skeleton
 *   - Erro em qualquer uma → ErrorState (mensagem da que falhou)
 *   - Sucesso → renderiza PropertyForm com initialData preenchido
 *
 * Sobre conversão null→undefined no payload:
 *   O backend faz `Object.fromEntries(...filter(undefined))` no update,
 *   ou seja, undefined é IGNORADO (não vira null). Então a gente envia
 *   undefined pra "não mudar" e o valor convertido pra "mudar".
 */
export const EditPropertyPage = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const propertyQuery = useProperty(id)
    const distributorsQuery = useDistributors()
    const updateMutation = useUpdateProperty()

    const isLoading = propertyQuery.isLoading || distributorsQuery.isLoading
    const isError = propertyQuery.isError || distributorsQuery.isError

    const errorMessage = pickErrorMessage(
        propertyQuery.error,
        distributorsQuery.error,
    )

    const handleSubmit = async (data: PropertyFormData) => {
        if (!id) return

        // Em update, undefined = "não mudar". O schema já transformou
        // string vazia em undefined nos campos opcionais.
        const payload: UpdatePropertyInput = {
            distributorId: data.distributorId,
            name: data.name,
            address: data.address,
            city: data.city,
            state: data.state,
            zipCode: data.zipCode,
        }

        try {
            await updateMutation.mutateAsync({ id, input: payload })
            navigate("/propriedades", { replace: true })
        } catch (error) {
            toast.error("Erro ao atualizar propriedade", {
                description: extractErrorMessage(error),
            })
        }
    }

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
                    Editar propriedade
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Atualize as informações da propriedade.
                </p>
            </div>

            {isLoading && <FormSkeleton />}

            {!isLoading && isError && <ErrorState message={errorMessage} />}

            {!isLoading &&
                !isError &&
                propertyQuery.data &&
                distributorsQuery.data && (
                    <div
                        className={cn(
                            "rounded-lg border bg-white p-6 shadow-sm",
                            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                        )}
                    >
                        <PropertyForm
                            initialData={propertyQuery.data}
                            distributors={distributorsQuery.data}
                            onSubmit={handleSubmit}
                            onCancel={() => navigate("/propriedades")}
                            submitLabel="Salvar alterações"
                        />
                    </div>
                )}
        </div>
    )
}

// Helpers

const pickErrorMessage = (
    propertyError: unknown,
    distributorsError: unknown,
): string => {
    if (propertyError instanceof Error) return propertyError.message
    if (distributorsError instanceof Error) return distributorsError.message
    return "Erro ao carregar propriedade"
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