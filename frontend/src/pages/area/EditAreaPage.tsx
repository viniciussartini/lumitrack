import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { AreaForm } from "@/components/area/AreaForm"
import { useArea } from "@/hooks/queries/useAreas"
import { useUpdateArea } from "@/hooks/queries/useAreaMutations"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { AreaFormData } from "@/schemas/area.schema"
import type { UpdateAreaInput } from "@/types/area.types"

/**
 * Página de edição de área.
 *
 * Carrega useArea(propertyId, areaId) pra preencher o initialData. Não
 * carrega a propriedade pai (diferente da NewAreaPage e da AreaDetailsPage)
 * porque o nome dela já é mostrado na URL e no breadcrumb implicitamente.
 *
 * Sobre conversão null/undefined no payload:
 *   O backend faz `Object.fromEntries(...filter(undefined))` no update,
 *   ou seja, undefined é IGNORADO (não vira null). Então a gente envia
 *   undefined pra "não mudar" e o valor real pra "mudar". O schema do
 *   form já transformou string vazia em undefined antes de chegar aqui.
 *
 * Rota: /propriedades/:propertyId/areas/:areaId/editar
 *
 * Após sucesso, volta pra AreaDetailsPage (não pra PropertyDetailsPage)
 * porque o usuário provavelmente quer ver o resultado da edição da área
 * que estava editando, não voltar 2 níveis na hierarquia.
 */
export const EditAreaPage = () => {
    const { propertyId, areaId } = useParams<{
        propertyId: string
        areaId: string
    }>()
    const navigate = useNavigate()

    const areaQuery = useArea(propertyId, areaId)
    const updateMutation = useUpdateArea()

    const handleSubmit = async (data: AreaFormData) => {
        if (!propertyId || !areaId) return

        // Em update, undefined = "não mudar". O schema já transformou
        // string vazia em undefined nos campos opcionais.
        const payload: UpdateAreaInput = {
            name: data.name,
            ...(data.description !== undefined && {
                description: data.description,
            }),
        }

        try {
            await updateMutation.mutateAsync({
                propertyId,
                areaId,
                input: payload,
            })
            navigate(`/propriedades/${propertyId}/areas/${areaId}`, {
                replace: true,
            })
        } catch (error) {
            toast.error("Erro ao atualizar área", {
                description: extractErrorMessage(error),
            })
        }
    }

    const backHref =
        propertyId && areaId
            ? `/propriedades/${propertyId}/areas/${areaId}`
            : propertyId
                ? `/propriedades/${propertyId}`
                : "/propriedades"

    return (
        <div className="flex flex-col gap-6">
            <Link
                to={backHref}
                className={cn(
                    "inline-flex w-fit items-center gap-1 text-sm",
                    "text-slate-600 hover:text-slate-900",
                    "dark:text-slate-400 dark:hover:text-slate-200",
                )}
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar para área
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Editar área
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Atualize os dados da área.
                </p>
            </div>

            {areaQuery.isLoading && <FormSkeleton />}

            {areaQuery.isError && (
                <ErrorState
                    message={
                        areaQuery.error instanceof Error
                            ? areaQuery.error.message
                            : "Não foi possível carregar a área."
                    }
                />
            )}

            {areaQuery.isSuccess && (
                <AreaForm
                    initialData={areaQuery.data}
                    onSubmit={handleSubmit}
                    onCancel={() => navigate(backHref)}
                    submitLabel="Salvar alterações"
                />
            )}
        </div>
    )
}

const FormSkeleton = () => (
    <div className="flex flex-col gap-4">
        <div className="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-10 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
    </div>
)

interface ErrorStateProps {
    message: string
}

const ErrorState = ({ message }: ErrorStateProps) => (
    <div
        className={cn(
            "flex items-start gap-3 rounded-lg border p-4",
            "border-red-200 bg-red-50 text-red-900",
            "dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
        )}
        role="alert"
    >
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm">{message}</p>
    </div>
)