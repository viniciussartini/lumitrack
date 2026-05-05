import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { DeviceForm } from "@/components/device/DeviceForm"
import { useCreateDevice } from "@/hooks/queries/useDeviceMutations"
import { useArea } from "@/hooks/queries/useAreas"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { DeviceFormData } from "@/schemas/device.schema"
import type { CreateDeviceInput } from "@/types/device.types"

/**
 * Página de cadastro de novo dispositivo.
 *
 * Estados:
 *   - Loading da área pai → skeleton (precisamos do nome dela pro
 *     subtítulo, e pra confirmar que existe antes de deixar criar um
 *     device órfão)
 *   - Erro ao carregar área → ErrorState com botão de voltar
 *   - Sucesso → renderiza DeviceForm
 *
 * Conversão no submit:
 *   - undefined em campos opcionais é OMITIDO do payload — o backend aceita
 *     tanto undefined (não envia o campo) quanto valor preenchido.
 *   - propertyId e areaId vão como argumentos da mutation, não no body.
 *
 * Rota: /propriedades/:propertyId/areas/:areaId/devices/novo
 */
export const NewDevicePage = () => {
    const { propertyId, areaId } = useParams<{
        propertyId: string
        areaId: string
    }>()
    const navigate = useNavigate()

    const areaQuery = useArea(propertyId, areaId)
    const createMutation = useCreateDevice()

    const handleSubmit = async (data: DeviceFormData) => {
        if (!propertyId || !areaId) return

        const input: CreateDeviceInput = {
            name: data.name,
            ...(data.brand !== undefined && { brand: data.brand }),
            ...(data.model !== undefined && { model: data.model }),
            ...(data.powerWatts !== undefined && {
                powerWatts: data.powerWatts,
            }),
        }

        try {
            await createMutation.mutateAsync({
                propertyId,
                areaId,
                input,
            })
            // Volta pra área pai — a lista de devices vai re-renderizar
            // com o novo device via invalidate
            navigate(`/propriedades/${propertyId}/areas/${areaId}`, {
                replace: true,
            })
        } catch (error) {
            // Toast de sucesso vem do hook. Aqui só erro.
            toast.error("Erro ao criar dispositivo", {
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
                    Novo dispositivo
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {areaQuery.data
                        ? `Cadastre um novo dispositivo em ${areaQuery.data.name}.`
                        : "Cadastre um novo dispositivo nesta área."}
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
                <DeviceForm
                    onSubmit={handleSubmit}
                    onCancel={() => navigate(backHref)}
                    submitLabel="Cadastrar dispositivo"
                />
            )}
        </div>
    )
}

const FormSkeleton = () => (
    <div className="flex flex-col gap-4">
        <div className="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
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