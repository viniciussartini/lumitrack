import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { toast } from "sonner"
import { ConsumptionForm } from "@/components/consumption/ConsumptionForm"
import {
    useCreateConsumptionForArea,
    useCreateConsumptionForDevice,
    useCreateConsumptionForProperty,
    useUpdateConsumption,
} from "@/hooks/queries/useConsumptionMutations"
import { extractErrorMessage } from "@/services/api"
import { formInputToIso } from "@/lib/consumption-date"
import { cn } from "@/lib/cn"
import type { ConsumptionFormData } from "@/schemas/consumption.schema"
import type {
    ConsumptionRecord,
    CreateConsumptionInput,
    UpdateConsumptionInput,
} from "@/types/consumption.types"

/**
 * Discriminated union: identifica o target do registro.
 *
 * É usado por todo o componente pra escolher qual mutation chamar e qual
 * URL aninhada montar. As 3 variantes refletem as 3 opções polimórficas
 * do backend.
 */
export type ConsumptionFormTarget =
    | { type: "property"; propertyId: string }
    | { type: "area"; propertyId: string; areaId: string }
    | {
        type: "device"
        propertyId: string
        areaId: string
        deviceId: string
    }

type DialogMode =
    | { kind: "create" }
    | { kind: "edit"; record: ConsumptionRecord }

interface ConsumptionFormDialogProps {
    isOpen: boolean
    onClose: () => void
    target: ConsumptionFormTarget
    mode: DialogMode
}

/**
 * Dialog (Radix) que envolve o ConsumptionForm e orquestra a mutation
 * apropriada baseada em (target × mode).
 *
 * Form vs FormDialog:
 *   - ConsumptionForm é PURO (RHF + UI). Não conhece mutations, não
 *     conhece toasts, não conhece o target. Fácil de testar isoladamente.
 *   - ConsumptionFormDialog faz o "orquestração": pega o submit do form,
 *     converte data → ISO, escolhe a mutation certa, traduz erro pra toast,
 *     fecha o dialog em sucesso.
 *
 * Por que `mode` é discriminated union em vez de duas props (`isEdit` +
 * `record?`):
 *   - Garantia em compile-time de que `record` existe quando estamos em
 *     edit. Sem isso, teríamos `record?` opcional e if/else runtime para
 *     cada acesso.
 *
 * Sobre erros (decisão UX Q3 — "toast genérico"):
 *   - Erros 4xx/5xx (incluindo 409 de duplicata) caem no try/catch e viram
 *     toast.error com mensagem de extractErrorMessage. O backend já entrega
 *     mensagens humanas no payload de erro ("Já existe um registro DAILY
 *     para esta data"), então o toast comunica adequadamente sem parsing
 *     adicional do status code.
 */
export const ConsumptionFormDialog = ({
    isOpen,
    onClose,
    target,
    mode,
}: ConsumptionFormDialogProps) => {
    const createForProperty = useCreateConsumptionForProperty()
    const createForArea = useCreateConsumptionForArea()
    const createForDevice = useCreateConsumptionForDevice()
    const update = useUpdateConsumption()

    const handleSubmit = async (data: ConsumptionFormData) => {
        if (mode.kind === "create") {
            await handleCreate(data)
        } else {
            await handleEdit(data, mode.record)
        }
    }

    const handleCreate = async (data: ConsumptionFormData) => {
        const input: CreateConsumptionInput = {
            period: data.period,
            referenceDate: formInputToIso(data.referenceDate, data.period),
            kwhConsumed: data.kwhConsumed,
            ...(data.notes !== undefined && { notes: data.notes }),
        }

        try {
            if (target.type === "property") {
                await createForProperty.mutateAsync({
                    propertyId: target.propertyId,
                    input,
                })
            } else if (target.type === "area") {
                await createForArea.mutateAsync({
                    propertyId: target.propertyId,
                    areaId: target.areaId,
                    input,
                })
            } else {
                await createForDevice.mutateAsync({
                    propertyId: target.propertyId,
                    areaId: target.areaId,
                    deviceId: target.deviceId,
                    input,
                })
            }
            onClose()
        } catch (error) {
            // Toast de sucesso vem do hook. Aqui só erro.
            toast.error("Erro ao criar registro", {
                description: extractErrorMessage(error),
            })
        }
    }

    const handleEdit = async (
        data: ConsumptionFormData,
        record: ConsumptionRecord,
    ) => {
        // Apenas kwhConsumed e notes são editáveis (period/referenceDate
        // são identificadores no backend). O form ainda inclui esses
        // campos em `data`, mas filtramos aqui.
        const input: UpdateConsumptionInput = {
            kwhConsumed: data.kwhConsumed,
            ...(data.notes !== undefined && { notes: data.notes }),
        }

        try {
            await update.mutateAsync({
                propertyId: target.propertyId,
                id: record.id,
                input,
            })
            onClose()
        } catch (error) {
            toast.error("Erro ao atualizar registro", {
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
                    data-testid="consumption-form-dialog"
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
                                {mode.kind === "create"
                                    ? "Registrar consumo"
                                    : "Editar registro"}
                            </Dialog.Title>
                            <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {mode.kind === "create"
                                    ? "Informe o período, a data e o consumo em kWh."
                                    : "Atualize o consumo ou as observações."}
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
                        <ConsumptionForm
                            initialData={
                                mode.kind === "edit" ? mode.record : undefined
                            }
                            onSubmit={handleSubmit}
                            onCancel={onClose}
                            submitLabel={
                                mode.kind === "create"
                                    ? "Criar registro"
                                    : "Salvar alterações"
                            }
                        />
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}