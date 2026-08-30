import { toast } from "sonner"
import { FormDialog } from "@/components/ui/FormDialog"
import { MeterForm } from "@/components/meter/MeterForm"
import { useCreateMeter, useUpdateMeter } from "@/hooks/queries/useMeterMutations"
import { extractErrorMessage } from "@/services/api"
import type { MeterFormData } from "@/schemas/meter.schema"
import {
    QUANTITY_ADDRESS_PROTOCOLS,
    type CreateMeterInput,
    type Meter,
    type MeterProtocol,
    type TargetType,
    type UpdateMeterInput,
} from "@/types/meter.types"

type DialogMode =
    { kind: "create"; targetType: TargetType; targetId: string } | { kind: "edit"; meter: Meter }

interface MeterFormDialogProps {
    isOpen: boolean
    onClose: () => void
    mode: DialogMode
}

/**
 * Monta `extra` a partir dos campos de endereço por grandeza do form —
 * só os 4 protocolos de QUANTITY_ADDRESS_PROTOCOLS usam algum destes
 * (issue #316). `voltageAddress` só existe pra MODBUS_RTU (os demais
 * guardam a voltagem no `address` de topo, já enviado à parte).
 */
function buildExtra(data: MeterFormData): Record<string, string> | undefined {
    if (!QUANTITY_ADDRESS_PROTOCOLS.includes(data.protocol as MeterProtocol)) return undefined

    const extra: Record<string, string> = {}
    if (data.protocol === "MODBUS_RTU" && data.voltageAddress !== undefined) {
        extra.voltageAddress = data.voltageAddress
    }
    if (data.currentAddress !== undefined) extra.currentAddress = data.currentAddress
    if (data.powerAddress !== undefined) extra.powerAddress = data.powerAddress
    if (data.powerFactorAddress !== undefined) extra.powerFactorAddress = data.powerFactorAddress

    return Object.keys(extra).length > 0 ? extra : undefined
}

/** Campos de conexão comuns a criação e edição — só o alvo (targetField) difere. */
function buildConnectionFields(data: MeterFormData) {
    const extra = buildExtra(data)
    return {
        protocol: data.protocol,
        ...(data.host !== undefined && { host: data.host }),
        ...(data.port !== undefined && { port: data.port }),
        ...(data.topic !== undefined && { topic: data.topic }),
        ...(data.address !== undefined && { address: data.address }),
        ...(extra !== undefined && { extra }),
    }
}

function buildCreateInput(
    data: MeterFormData,
    mode: Extract<DialogMode, { kind: "create" }>,
): CreateMeterInput {
    const targetField =
        mode.targetType === "PROPERTY"
            ? { targetType: "PROPERTY" as const, propertyId: mode.targetId }
            : mode.targetType === "AREA"
              ? { targetType: "AREA" as const, areaId: mode.targetId }
              : { targetType: "DEVICE" as const, deviceId: mode.targetId }

    return { ...targetField, name: data.name, ...buildConnectionFields(data) }
}

function buildUpdateInput(data: MeterFormData): UpdateMeterInput {
    return { name: data.name, ...buildConnectionFields(data) }
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
        try {
            if (mode.kind === "create") {
                await createMeter.mutateAsync(buildCreateInput(data, mode))
            } else {
                await updateMeter.mutateAsync({ id: mode.meter.id, input: buildUpdateInput(data) })
            }
            onClose()
        } catch (error) {
            const description = extractErrorMessage(error)
            if (mode.kind === "create") {
                toast.error("Erro ao vincular medidor", { description })
            } else {
                toast.error("Erro ao atualizar medidor", { description })
            }
        }
    }

    return (
        <FormDialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
            kicker="Medidor"
            title={mode.kind === "create" ? "Configurar medidor" : "Editar medidor"}
        >
            <MeterForm
                initialData={mode.kind === "edit" ? mode.meter : undefined}
                onSubmit={handleSubmit}
                onCancel={onClose}
                submitLabel={mode.kind === "create" ? "Vincular medidor" : "Salvar alterações"}
            />
        </FormDialog>
    )
}
