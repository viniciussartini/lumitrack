import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { meterFormSchema, type MeterFormData, type MeterFormInput } from "@/schemas/meter.schema"
import {
    METER_PROTOCOL_LABELS,
    NETWORK_PROTOCOLS,
    SERIAL_PROTOCOLS,
    TOPIC_PROTOCOLS,
    type Meter,
    type MeterProtocol,
} from "@/types/meter.types"

interface MeterFormProps {
    /** Dados iniciais — quando presente, o form opera em modo edição. */
    initialData?: Meter
    onSubmit: (data: MeterFormData) => Promise<void>
    onCancel: () => void
    submitLabel?: string
}

const PROTOCOL_OPTIONS = Object.entries(METER_PROTOCOL_LABELS) as [MeterProtocol, string][]

/**
 * Form de medidor — vale para criação (vinculado a um alvo, resolvido fora
 * deste componente) e edição (só a config de conexão, o alvo é imutável).
 *
 * Os campos de conexão (host/port/topic/address) aparecem condicionalmente
 * conforme o protocolo selecionado — a mesma união que o backend valida,
 * mas exibida como um único form reativo em vez de uma tela por protocolo.
 */
export const MeterForm = ({
    initialData,
    onSubmit,
    onCancel,
    submitLabel = "Salvar",
}: MeterFormProps) => {
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<MeterFormInput, unknown, MeterFormData>({
        resolver: zodResolver(meterFormSchema),
        mode: "onBlur",
        defaultValues: initialData
            ? {
                  name: initialData.name,
                  protocol: initialData.protocol,
                  host: initialData.host ?? "",
                  port: initialData.port ?? undefined,
                  topic: initialData.topic ?? "",
                  address: initialData.address ?? "",
              }
            : {
                  name: "",
                  protocol: "MQTT",
                  host: "",
                  port: undefined,
                  topic: "",
                  address: "",
              },
    })

    const protocol = watch("protocol") as MeterProtocol
    const needsHostPort = NETWORK_PROTOCOLS.includes(protocol)
    const needsTopic = TOPIC_PROTOCOLS.includes(protocol)
    const needsAddress = SERIAL_PROTOCOLS.includes(protocol)

    return (
        <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            className="flex flex-col gap-6"
            noValidate
        >
            <Input
                label="Nome do medidor"
                placeholder="Medidor principal"
                error={errors.name?.message}
                {...register("name")}
            />

            <Select label="Protocolo" error={errors.protocol?.message} {...register("protocol")}>
                {PROTOCOL_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                        {label}
                    </option>
                ))}
            </Select>

            {needsHostPort && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input
                        label="Host"
                        placeholder="192.168.0.10"
                        error={errors.host?.message}
                        {...register("host")}
                    />
                    <Input
                        label="Porta"
                        type="number"
                        placeholder="1883"
                        error={errors.port?.message}
                        {...register("port")}
                    />
                </div>
            )}

            {needsTopic && (
                <Input
                    label="Tópico MQTT"
                    placeholder="lumitrack/medidores/123"
                    error={errors.topic?.message}
                    {...register("topic")}
                />
            )}

            {needsAddress && (
                <Input
                    label="Endereço"
                    placeholder="/dev/ttyUSB0 ou 1"
                    error={errors.address?.message}
                    {...register("address")}
                />
            )}

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSubmitting}
                >
                    Cancelar
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                    {submitLabel}
                </Button>
            </div>
        </form>
    )
}
