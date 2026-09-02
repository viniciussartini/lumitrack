import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { meterFormSchema, type MeterFormData, type MeterFormInput } from "@/schemas/meter.schema"
import {
    ADDRESS_PROTOCOLS,
    METER_PROTOCOL_LABELS,
    NETWORK_PROTOCOLS,
    QUANTITY_ADDRESS_PROTOCOLS,
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

// TODO(design): aguardando handoff — campos de endereço por grandeza
// elétrica. Sem bundle no `.claude/design/` cobrindo estes campos; versão
// utilitária provisória (shadcn default), seguindo a regra de ausência do
// `10-design-system.md` (decisão tomada com o usuário antes da
// implementação). Placeholder só ilustra o formato esperado por protocolo
// — não é validação (isso é o schema).
const ADDRESS_PLACEHOLDER_BY_PROTOCOL: Partial<Record<MeterProtocol, string>> = {
    MODBUS_TCP: "Registrador (ex.: 0)",
    MODBUS_RTU: "/dev/ttyUSB0",
    ETHERNET_IP: "Tag (ex.: Program:Main.Voltage)",
    PROFINET: "DB (ex.: DB1)",
}

const QUANTITY_PLACEHOLDER_BY_PROTOCOL: Partial<Record<MeterProtocol, string>> = {
    MODBUS_TCP: "Registrador (ex.: 1)",
    MODBUS_RTU: "Registrador (ex.: 1)",
    ETHERNET_IP: "Tag (ex.: Program:Main.Current)",
    PROFINET: "DB (ex.: DB2)",
}

/** Lê um campo string de `extra` (tipado como `Record<string, unknown>` na API) com segurança. */
function extraStringField(extra: Meter["extra"], key: string): string {
    const value = extra?.[key]
    return typeof value === "string" ? value : ""
}

/** Lê um campo booleano de `extra` com segurança (ex.: `passwordSet`). */
function extraBooleanField(extra: Meter["extra"] | undefined, key: string): boolean {
    return extra?.[key] === true
}

function buildDefaultValues(initialData: Meter | undefined): MeterFormInput {
    if (!initialData) {
        return {
            name: "",
            protocol: "MQTT",
            host: "",
            port: undefined,
            topic: "",
            address: "",
            voltageAddress: "",
            currentAddress: "",
            powerAddress: "",
            powerFactorAddress: "",
            mqttUsername: "",
            mqttPassword: "",
        }
    }

    return {
        name: initialData.name,
        protocol: initialData.protocol,
        host: initialData.host ?? "",
        port: initialData.port ?? undefined,
        topic: initialData.topic ?? "",
        address: initialData.address ?? "",
        voltageAddress: extraStringField(initialData.extra, "voltageAddress"),
        currentAddress: extraStringField(initialData.extra, "currentAddress"),
        powerAddress: extraStringField(initialData.extra, "powerAddress"),
        powerFactorAddress: extraStringField(initialData.extra, "powerFactorAddress"),
        // Usuário não é sensível — a API devolve em claro (`toMeterResponse`).
        // Senha nunca vem do backend em claro (só `passwordSet: boolean`) —
        // o campo nasce sempre vazio; o placeholder condicional em
        // `MqttCredentialFields` avisa que deixá-lo em branco preserva a
        // senha já configurada.
        mqttUsername: extraStringField(initialData.extra, "username"),
        mqttPassword: "",
    }
}

interface QuantityAddressFieldsProps {
    protocol: MeterProtocol
    register: UseFormRegister<MeterFormInput>
    errors: FieldErrors<MeterFormData>
}

/**
 * Endereços de grandeza elétrica (extra.*) — separado do form principal só
 * pra manter `MeterForm` dentro dos tetos de tamanho/complexidade do kit;
 * sem estado ou lógica própria, é puramente apresentação condicional.
 */
const QuantityAddressFields = ({ protocol, register, errors }: QuantityAddressFieldsProps) => (
    <>
        {protocol === "MODBUS_RTU" && (
            <Input
                label="Endereço de voltagem"
                placeholder={QUANTITY_PLACEHOLDER_BY_PROTOCOL[protocol]}
                error={errors.voltageAddress?.message}
                {...register("voltageAddress")}
            />
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
                label="Endereço de corrente"
                placeholder={QUANTITY_PLACEHOLDER_BY_PROTOCOL[protocol]}
                error={errors.currentAddress?.message}
                {...register("currentAddress")}
            />
            <Input
                label="Endereço de potência"
                placeholder={QUANTITY_PLACEHOLDER_BY_PROTOCOL[protocol]}
                error={errors.powerAddress?.message}
                {...register("powerAddress")}
            />
            <Input
                label="Endereço de fator de potência"
                placeholder={QUANTITY_PLACEHOLDER_BY_PROTOCOL[protocol]}
                error={errors.powerFactorAddress?.message}
                {...register("powerFactorAddress")}
            />
        </div>
    </>
)

interface MqttCredentialFieldsProps {
    register: UseFormRegister<MeterFormInput>
    errors: FieldErrors<MeterFormData>
    /** Medidor já tem senha configurada? Muda o placeholder do campo — a
     * senha em si nunca chega aqui (o backend não devolve em claro). */
    hasStoredPassword: boolean
}

/**
 * Credencial MQTT (extra.username/extra.password) — separado do form
 * principal pelo mesmo motivo de `QuantityAddressFields` (teto de tamanho
 * do kit). Único protocolo com noção de usuário/senha na conexão.
 */
const MqttCredentialFields = ({
    register,
    errors,
    hasStoredPassword,
}: MqttCredentialFieldsProps) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
            label="Usuário MQTT (opcional)"
            placeholder="Deixe em branco se o broker não exigir"
            error={errors.mqttUsername?.message}
            {...register("mqttUsername")}
        />
        <Input
            label="Senha MQTT (opcional)"
            type="password"
            placeholder={
                hasStoredPassword
                    ? "Deixe em branco para manter a senha atual"
                    : "Deixe em branco se o broker não exigir"
            }
            error={errors.mqttPassword?.message}
            {...register("mqttPassword")}
        />
    </div>
)

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
        defaultValues: buildDefaultValues(initialData),
    })

    const protocol = watch("protocol") as MeterProtocol
    const needsHostPort = NETWORK_PROTOCOLS.includes(protocol)
    const needsTopic = TOPIC_PROTOCOLS.includes(protocol)
    const needsAddress = ADDRESS_PROTOCOLS.includes(protocol)
    const needsQuantityAddresses = QUANTITY_ADDRESS_PROTOCOLS.includes(protocol)
    // Único protocolo com credencial — os demais não têm noção de
    // usuário/senha na conexão (rede local/serial direta).
    const needsMqttCredentials = protocol === "MQTT"
    const hasStoredPassword = extraBooleanField(initialData?.extra, "passwordSet")

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

            {needsMqttCredentials && (
                <MqttCredentialFields
                    register={register}
                    errors={errors}
                    hasStoredPassword={hasStoredPassword}
                />
            )}

            {needsAddress && (
                <Input
                    label="Endereço"
                    placeholder={ADDRESS_PLACEHOLDER_BY_PROTOCOL[protocol] ?? "/dev/ttyUSB0 ou 1"}
                    error={errors.address?.message}
                    {...register("address")}
                />
            )}

            {needsQuantityAddresses && (
                <QuantityAddressFields protocol={protocol} register={register} errors={errors} />
            )}

            <div className="border-divider flex justify-end gap-2 border-t pt-4">
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
