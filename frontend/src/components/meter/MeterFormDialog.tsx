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
 * Monta só os endereços de grandeza a partir do form — só os 4 protocolos
 * de QUANTITY_ADDRESS_PROTOCOLS usam algum destes. `voltageAddress` só
 * existe pra MODBUS_RTU (os demais guardam a voltagem no `address` de
 * topo, já enviado à parte).
 */
function buildQuantityExtra(data: MeterFormData): Record<string, string> | undefined {
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

/**
 * Credencial MQTT a partir do form — só existe para esse protocolo.
 * `mqttPassword` fica de fora do payload quando o campo está vazio (usuário
 * não digitou nada) — o campo nunca é pré-preenchido com o valor real (o
 * backend não devolve senha em claro, só `passwordSet`), então "vazio" aqui
 * significa sempre "não mexer", nunca "remover". A preservação de verdade
 * não acontece aqui nem em `existingExtra` (a resposta da API nunca carrega
 * a senha, então não há o que mesclar) — é `MeterRepository.update` quem
 * recarrega e mantém a senha cifrada já armazenada quando `password` não
 * vem na chave `extra`.
 */
function buildMqttExtra(data: MeterFormData): Record<string, string> | undefined {
    if (data.protocol !== "MQTT") return undefined

    const extra: Record<string, string> = {}
    if (data.mqttUsername !== undefined) extra.username = data.mqttUsername
    if (data.mqttPassword !== undefined) extra.password = data.mqttPassword

    return Object.keys(extra).length > 0 ? extra : undefined
}

/**
 * Remove de `existingExtra` os campos que só existem na resposta da API,
 * nunca no que se pode escrever de volta — hoje só `passwordSet`
 * (`sanitizeExtraForResponse` no backend). Sem isto, o merge com `newExtra`
 * reenviaria esse campo derivado no payload de update; hoje é inofensivo só
 * porque o schema Zod do backend descarta chaves desconhecidas por padrão.
 */
function stripDerivedExtraFields(extra?: Meter["extra"]): Record<string, unknown> | undefined {
    if (!extra) return undefined
    const rest: Record<string, unknown> = { ...extra }
    delete rest.passwordSet
    return rest
}

/**
 * Campos de conexão comuns a criação e edição — só o alvo (targetField)
 * difere. `existingExtra` (só na edição) é mesclado por baixo de `newExtra`
 * (endereços de grandeza OU credencial MQTT, conforme o protocolo):
 * `MeterRepository.update` substitui a coluna `extra` INTEIRA sempre que a
 * chave vem no payload (não faz merge no backend) — reconstruí-la só com o
 * que este form edita apagaria silenciosamente `unitId`/`baudRate`/
 * `pollingIntervalMs`/`rack`/`slot`, que ele não expõe. Em CREATE não há
 * `extra` anterior — `existingExtra` fica `undefined`.
 */
function buildConnectionFields(data: MeterFormData, existingExtra?: Meter["extra"]) {
    // Mutuamente exclusivos por protocolo (MQTT nunca está em
    // QUANTITY_ADDRESS_PROTOCOLS) — nunca os dois preenchidos ao mesmo tempo.
    const newExtra = buildQuantityExtra(data) ?? buildMqttExtra(data)
    const extra = newExtra ? { ...stripDerivedExtraFields(existingExtra), ...newExtra } : undefined
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

function buildUpdateInput(data: MeterFormData, existingExtra: Meter["extra"]): UpdateMeterInput {
    return { name: data.name, ...buildConnectionFields(data, existingExtra) }
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
                const input = buildUpdateInput(data, mode.meter.extra)
                await updateMeter.mutateAsync({ id: mode.meter.id, input })
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
