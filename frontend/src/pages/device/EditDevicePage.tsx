import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { DeviceForm } from "@/components/device/DeviceForm"
import { useDevice } from "@/hooks/queries/useDevices"
import { useUpdateDevice } from "@/hooks/queries/useDeviceMutations"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { DeviceFormData } from "@/schemas/device.schema"
import type { UpdateDeviceInput } from "@/types/device.types"

/**
 * Página de edição de dispositivo.
 *
 * Carrega useDevice(propertyId, areaId, deviceId) pra preencher o initialData.
 *
 * Sobre conversão null/undefined no payload:
 *   O backend faz `Object.fromEntries(...filter(undefined))` no update,
 *   ou seja, undefined é IGNORADO (não vira null). Então é enviado
 *   undefined pra "não mudar" e o valor real pra "mudar". O schema do
 *   form já transformou string vazia em undefined antes de chegar aqui.
 *
 * Rota: /propriedades/:propertyId/areas/:areaId/devices/:deviceId/editar
 *
 * Após sucesso, volta pra DeviceDetailsPage (não pra AreaDetailsPage)
 * porque o usuário provavelmente quer ver o resultado da edição do
 * device que estava editando.
 */
export const EditDevicePage = () => {
    const { propertyId, areaId, deviceId } = useParams<{
        propertyId: string
        areaId: string
        deviceId: string
    }>()
    const navigate = useNavigate()

    const deviceQuery = useDevice(propertyId, areaId, deviceId)
    const updateMutation = useUpdateDevice()

    const handleSubmit = async (data: DeviceFormData) => {
        if (!propertyId || !areaId || !deviceId) return

        // Em update, undefined = "não mudar". O schema já transformou
        // string vazia em undefined nos campos opcionais.
        const payload: UpdateDeviceInput = {
            name: data.name,
            ...(data.brand !== undefined && { brand: data.brand }),
            ...(data.model !== undefined && { model: data.model }),
            ...(data.powerWatts !== undefined && {
                powerWatts: data.powerWatts,
            }),
        }

        try {
            await updateMutation.mutateAsync({
                propertyId,
                areaId,
                deviceId,
                input: payload,
            })
            navigate(
                `/propriedades/${propertyId}/areas/${areaId}/devices/${deviceId}`,
                { replace: true },
            )
        } catch (error) {
            toast.error("Erro ao atualizar dispositivo", {
                description: extractErrorMessage(error),
            })
        }
    }

    const backHref =
        propertyId && areaId && deviceId
            ? `/propriedades/${propertyId}/areas/${areaId}/devices/${deviceId}`
            : propertyId && areaId
            ? `/propriedades/${propertyId}/areas/${areaId}`
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
                Voltar para dispositivo
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Editar dispositivo
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Atualize os dados do dispositivo.
                </p>
            </div>

            {deviceQuery.isLoading && <FormSkeleton />}

            {deviceQuery.isError && (
                <ErrorState
                    message={
                        deviceQuery.error instanceof Error
                            ? deviceQuery.error.message
                            : "Não foi possível carregar o dispositivo."
                    }
                />
            )}

            {deviceQuery.isSuccess && (
                <DeviceForm
                    initialData={deviceQuery.data}
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