import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { toast } from "sonner"
import { MeterForm } from "@/components/meter/MeterForm"
import { useCreateMeter, useUpdateMeter } from "@/hooks/queries/useMeterMutations"
import { extractErrorMessage } from "@/services/api"
import { cn } from "@/lib/cn"
import type { MeterFormData } from "@/schemas/meter.schema"
import type { CreateMeterInput, Meter, TargetType, UpdateMeterInput } from "@/types/meter.types"

type DialogMode =
    | { kind: "create"; targetType: TargetType; targetId: string }
    | { kind: "edit"; meter: Meter }

interface MeterFormDialogProps {
    isOpen: boolean
    onClose: () => void
    mode: DialogMode
}

/**
 * Dialog (Radix) que envolve o MeterForm e orquestra create/update.
 * Mesmo padrão de `AlertFormDialog`/`ConsumptionFormDialog`: o form é puro
 * (RHF + UI), o dialog resolve qual mutation chamar e traduz erro pra toast.
 */
export const MeterFormDialog = ({ isOpen, onClose, mode }: MeterFormDialogProps) => {
    const createMeter = useCreateMeter()
    const updateMeter = useUpdateMeter()

    const handleSubmit = async (data: MeterFormData) => {
        if (mode.kind === "create") {
            const targetField =
                mode.targetType === "PROPERTY"
                    ? { targetType: "PROPERTY" as const, propertyId: mode.targetId }
                    : mode.targetType === "AREA"
                    ? { targetType: "AREA" as const, areaId: mode.targetId }
                    : { targetType: "DEVICE" as const, deviceId: mode.targetId }

            const input: CreateMeterInput = {
                ...targetField,
                name: data.name,
                protocol: data.protocol,
                ...(data.host !== undefined && { host: data.host }),
                ...(data.port !== undefined && { port: data.port }),
                ...(data.topic !== undefined && { topic: data.topic }),
                ...(data.address !== undefined && { address: data.address }),
            }

            try {
                await createMeter.mutateAsync(input)
                onClose()
            } catch (error) {
                toast.error("Erro ao vincular medidor", {
                    description: extractErrorMessage(error),
                })
            }
            return
        }

        const input: UpdateMeterInput = {
            name: data.name,
            protocol: data.protocol,
            ...(data.host !== undefined && { host: data.host }),
            ...(data.port !== undefined && { port: data.port }),
            ...(data.topic !== undefined && { topic: data.topic }),
            ...(data.address !== undefined && { address: data.address }),
        }

        try {
            await updateMeter.mutateAsync({ id: mode.meter.id, input })
            onClose()
        } catch (error) {
            toast.error("Erro ao atualizar medidor", {
                description: extractErrorMessage(error),
            })
        }
    }

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay
                    className={cn(
                        "fixed inset-0 z-40 bg-black/50",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    )}
                />
                <Dialog.Content
                    data-testid="meter-form-dialog"
                    className={cn(
                        "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
                        "rounded-lg border bg-white p-6 shadow-lg",
                        "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                    )}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                {mode.kind === "create" ? "Configurar medidor" : "Editar medidor"}
                            </Dialog.Title>
                            <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {mode.kind === "create"
                                    ? "Vincule um medidor IoT para coletar consumo automaticamente."
                                    : "Atualize a configuração de conexão do medidor."}
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            className={cn(
                                "rounded-md p-1 text-slate-500",
                                "hover:bg-slate-100 hover:text-slate-700",
                                "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                                "focus:outline-none focus:ring-2 focus:ring-brand-500",
                            )}
                            aria-label="Fechar"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    <div className="mt-4">
                        <MeterForm
                            initialData={mode.kind === "edit" ? mode.meter : undefined}
                            onSubmit={handleSubmit}
                            onCancel={onClose}
                            submitLabel={mode.kind === "create" ? "Vincular medidor" : "Salvar alterações"}
                        />
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
