import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { AreaForm } from "@/components/area/AreaForm"
import { useCreateArea } from "@/hooks/queries/useAreaMutations"
import { useProperty } from "@/hooks/queries/useProperties"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { AreaFormData } from "@/schemas/area.schema"
import type { CreateAreaInput } from "@/types/area.types"

/**
 * Página de cadastro de nova área.
 *
 * Estados:
 *   - Loading da propriedade pai → skeleton (precisamos do nome dela pro
 *     subtítulo da página, e pra confirmar que ela existe antes de
 *     deixar criar uma área órfã)
 *   - Erro ao carregar propriedade → ErrorState com botão de voltar
 *   - Sucesso → renderiza AreaForm
 *
 * Conversão no submit:
 *   - undefined em description é OMITIDO do payload — o backend aceita
 *     tanto undefined (não envia o campo) quanto string com 1+ chars.
 *   - propertyId vai como argumento da mutation (não no body), porque o
 *     endpoint é /properties/:propertyId/areas e o controller pega da URL.
 *
 * Rota: /propriedades/:propertyId/areas/nova
 */
export const NewAreaPage = () => {
    const { propertyId } = useParams<{ propertyId: string }>()
    const navigate = useNavigate()

    const propertyQuery = useProperty(propertyId)
    const createMutation = useCreateArea()

    const handleSubmit = async (data: AreaFormData) => {
        if (!propertyId) return

        const input: CreateAreaInput = {
            name: data.name,
            ...(data.description !== undefined && {
                description: data.description,
            }),
        }

        try {
            await createMutation.mutateAsync({ propertyId, input })
            // Volta pra página da propriedade — a lista de áreas vai
            // re-renderizar com a nova área via invalidate
            navigate(`/propriedades/${propertyId}`, { replace: true })
        } catch (error) {
            // Toast de sucesso vem do hook. Aqui só erro.
            toast.error("Erro ao criar área", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <Link
                to={
                    propertyId
                        ? `/propriedades/${propertyId}`
                        : "/propriedades"
                }
                className={cn(
                    "inline-flex w-fit items-center gap-1 text-sm",
                    "text-slate-600 hover:text-slate-900",
                    "dark:text-slate-400 dark:hover:text-slate-200",
                )}
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar para propriedade
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Nova área
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {propertyQuery.data
                        ? `Cadastre uma nova área em ${propertyQuery.data.name}.`
                        : "Cadastre uma nova área nesta propriedade."}
                </p>
            </div>

            {propertyQuery.isLoading && <FormSkeleton />}

            {propertyQuery.isError && (
                <ErrorState
                    message={
                        propertyQuery.error instanceof Error
                            ? propertyQuery.error.message
                            : "Não foi possível carregar a propriedade."
                    }
                />
            )}

            {propertyQuery.isSuccess && (
                <AreaForm
                    onSubmit={handleSubmit}
                    onCancel={() =>
                        navigate(`/propriedades/${propertyId}`)
                    }
                    submitLabel="Cadastrar área"
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