import {
    useForm,
    type FieldErrors,
    type UseFormRegister,
    type UseFormSetValue,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { formatCep } from "@/lib/masks"
import {
    propertyFormSchema,
    type PropertyFormData,
    type PropertyFormInput,
} from "@/schemas/property.schema"
import {
    BILLING_CLASS_LABELS,
    ELECTRICAL_SYSTEM_LABELS,
    TARIFF_SUBGROUP_LABELS,
    VALID_UFS,
    type BillingClass,
    type ElectricalSystem,
    type Property,
    type TariffGroup,
    type TariffSubgroup,
} from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"

interface PropertyFormProps {
    /** Dados iniciais — quando presente, o form opera em modo edição */
    initialData?: Property
    /** Lista de distribuidoras para popular o select. Sempre obrigatória. */
    distributors: Distributor[]
    /** Callback de submit. Recebe os dados validados e transformados. */
    onSubmit: (data: PropertyFormData) => Promise<void>
    /** Callback de cancelamento — geralmente um navigate("..") */
    onCancel: () => void
    /** Texto do botão de submit. Default: "Salvar" */
    submitLabel?: string
}

/**
 * Form de propriedade — usado em criação e edição.
 *
 * Diferenças entre os modos:
 *   - CRIAÇÃO (initialData=undefined): defaults vazios, primeiro campo focável
 *   - EDIÇÃO (initialData=Property): campos preenchidos com null→"" convertido
 *
 * Estrutura visual: 3 seções (Identificação, Distribuidora, Endereço) com
 * headings semânticos. Layout dos campos: name e address full width;
 * CEP+cidade+UF em grid de 6 colunas no desktop (proporção 2/3/1).
 *
 * Por que distributors vem por prop?
 *   Acoplar useDistributors() aqui dentro complicaria os testes (precisa
 *   mockar o hook) e duplicaria a query — a página chamadora já carrega
 *   distribuidoras pra decidir se mostra o form ou o empty state.
 */
/** Extraído por caber no teto de linhas/complexidade do componente. */
const buildDefaultValues = (initialData: Property | undefined): Partial<PropertyFormInput> =>
    initialData
        ? {
              distributorId: initialData.distributorId,
              name: initialData.name,
              // null → "" porque <input> não aceita null; o schema converte
              // string vazia de volta pra undefined antes do submit.
              address: initialData.address ?? "",
              city: initialData.city ?? "",
              state: initialData.state ?? "",
              zipCode: initialData.zipCode ?? "",
              electricalSystem: initialData.electricalSystem,
              tariffGroup: initialData.tariffGroup,
              billingClass: initialData.billingClass ?? undefined,
              tariffSubgroup: initialData.tariffSubgroup ?? undefined,
              tariffModality: initialData.tariffModality ?? undefined,
              contractedDemandKw: initialData.contractedDemandKw ?? undefined,
              publicLightingFeeBrl: initialData.publicLightingFeeBrl ?? undefined,
          }
        : {
              distributorId: "",
              name: "",
              address: "",
              city: "",
              state: "",
              zipCode: "",
              electricalSystem: "MONOPHASIC",
              tariffGroup: "GROUP_B",
              billingClass: "B1",
              publicLightingFeeBrl: undefined,
          }

export const PropertyForm = ({
    initialData,
    distributors,
    onSubmit,
    onCancel,
    submitLabel = "Salvar",
}: PropertyFormProps) => {
    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<PropertyFormInput, unknown, PropertyFormData>({
        resolver: zodResolver(propertyFormSchema),
        mode: "onBlur",
        defaultValues: buildDefaultValues(initialData),
    })

    const tariffGroup = watch("tariffGroup") as TariffGroup
    const isGroupA = tariffGroup === "GROUP_A"

    return (
        <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            className="flex flex-col gap-8"
            noValidate
        >
            <Section title="Identificação">
                <Input
                    label="Nome da propriedade"
                    placeholder="Casa Principal"
                    error={errors.name?.message}
                    {...register("name")}
                />
            </Section>

            <Section title="Distribuidora">
                <Select
                    label="Distribuidora vinculada"
                    helperText="Toda propriedade precisa estar vinculada a uma distribuidora cadastrada."
                    error={errors.distributorId?.message}
                    {...register("distributorId")}
                    defaultValue={initialData?.distributorId ?? ""}
                >
                    <option value="" disabled>
                        Selecione
                    </option>
                    {distributors.map((d) => (
                        <option key={d.id} value={d.id}>
                            {d.name}
                        </option>
                    ))}
                </Select>
            </Section>

            <Section title="Faturamento">
                <BillingFields
                    register={register}
                    errors={errors}
                    setValue={setValue}
                    initialData={initialData}
                    isGroupA={isGroupA}
                />
            </Section>

            <Section title="Endereço" description="Todos os campos de endereço são opcionais.">
                <AddressFields
                    register={register}
                    errors={errors}
                    setValue={setValue}
                    initialData={initialData}
                />
            </Section>

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

// Subcomponentes locais

interface BillingFieldsProps {
    register: UseFormRegister<PropertyFormInput>
    errors: FieldErrors<PropertyFormData>
    setValue: UseFormSetValue<PropertyFormInput>
    initialData: Property | undefined
    isGroupA: boolean
}

/**
 * Seção "Faturamento" — extraída do componente principal (teto de
 * linhas/complexidade).
 *
 * O select "Grupo tarifário" limpa os campos do grupo anterior ao trocar:
 * sem isso, `billingClass` (default "B1" nos valores iniciais do form)
 * continua no estado do react-hook-form mesmo depois do campo sumir da tela
 * (RHF não desregistra campos desmontados por padrão — `shouldUnregister`
 * é `false`) e é enviado junto com `tariffGroup: "GROUP_A"` no submit,
 * disparando "Classe de faturamento não se aplica a propriedades do Grupo A"
 * num campo que o usuário nem vê mais.
 */
const BillingFields = ({
    register,
    errors,
    setValue,
    initialData,
    isGroupA,
}: BillingFieldsProps) => (
    <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
                label="Sistema elétrico"
                helperText="Define o piso de disponibilidade (30/50/100 kWh) na tarifação."
                error={errors.electricalSystem?.message}
                {...register("electricalSystem")}
                defaultValue={initialData?.electricalSystem ?? "MONOPHASIC"}
            >
                {(Object.entries(ELECTRICAL_SYSTEM_LABELS) as [ElectricalSystem, string][]).map(
                    ([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ),
                )}
            </Select>

            <Select
                label="Grupo tarifário"
                helperText="Alta tensão (Grupo A) cobra por demanda contratada além do consumo."
                error={errors.tariffGroup?.message}
                {...register("tariffGroup", {
                    onChange: (e) => {
                        if (e.target.value === "GROUP_A") {
                            setValue("billingClass", undefined)
                        } else {
                            setValue("tariffSubgroup", undefined)
                            setValue("tariffModality", undefined)
                            setValue("contractedDemandKw", undefined)
                        }
                    },
                })}
                defaultValue={initialData?.tariffGroup ?? "GROUP_B"}
            >
                <option value="GROUP_B">Grupo B — baixa tensão</option>
                <option value="GROUP_A">Grupo A — alta tensão</option>
            </Select>
        </div>

        {isGroupA ? (
            <GroupAFields register={register} errors={errors} />
        ) : (
            <Select
                label="Classe de faturamento"
                error={errors.billingClass?.message}
                {...register("billingClass")}
                defaultValue={initialData?.billingClass ?? "B1"}
            >
                {(Object.entries(BILLING_CLASS_LABELS) as [BillingClass, string][]).map(
                    ([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ),
                )}
            </Select>
        )}

        <Input
            label="Contribuição de iluminação pública — CIP (R$)"
            type="number"
            step="0.01"
            placeholder="0,00"
            helperText="Opcional — nem todo município cobra."
            error={errors.publicLightingFeeBrl?.message}
            {...register("publicLightingFeeBrl")}
        />
    </>
)

interface AddressFieldsProps {
    register: UseFormRegister<PropertyFormInput>
    errors: FieldErrors<PropertyFormData>
    setValue: UseFormSetValue<PropertyFormInput>
    initialData: Property | undefined
}

/** Seção "Endereço" — extraída do componente principal (teto de linhas/complexidade). */
const AddressFields = ({ register, errors, setValue, initialData }: AddressFieldsProps) => (
    <div className="flex flex-col gap-4">
        <Input
            label="Logradouro"
            placeholder="Rua das Flores, 100"
            error={errors.address?.message}
            {...register("address")}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
                label="CEP"
                inputMode="numeric"
                placeholder="00000-000"
                error={errors.zipCode?.message}
                {...register("zipCode", {
                    onChange: (e) => {
                        e.target.value = formatCep(e.target.value)
                        setValue("zipCode", e.target.value, { shouldValidate: false })
                    },
                })}
            />

            <Input
                label="Cidade"
                placeholder="Belo Horizonte"
                error={errors.city?.message}
                {...register("city")}
            />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
                label="UF"
                error={errors.state?.message}
                {...register("state")}
                defaultValue={initialData?.state ?? ""}
            >
                <option value="">—</option>
                {VALID_UFS.map((uf) => (
                    <option key={uf} value={uf}>
                        {uf}
                    </option>
                ))}
            </Select>
        </div>
    </div>
)

interface GroupAFieldsProps {
    register: UseFormRegister<PropertyFormInput>
    errors: FieldErrors<PropertyFormData>
}

/**
 * Campos exclusivos do Grupo A — mostrados quando `tariffGroup` é
 * "GROUP_A" (ver `isGroupA` em `PropertyForm`), mesmo padrão de subcomponente
 * condicional de `MeterForm.tsx` (`MqttCredentialFields`).
 *
 * Modalidade oferece só "Horária Verde": é a única com cálculo de conta
 * implementado no backend hoje (`ConsumptionService` lança erro claro para
 * Azul/Convencional) — Azul chega na Fase 20, junto da segunda demanda
 * contratada (ponta/fora de ponta) que ela exige.
 */
const GroupAFields = ({ register, errors }: GroupAFieldsProps) => (
    <div className="flex flex-col gap-4">
        <span className="font-heading text-accent-700 border-divider text-11 border-b pb-1.5 font-semibold tracking-[.07em] uppercase">
            Exclusivo do Grupo A
        </span>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
                label="Subgrupo"
                error={errors.tariffSubgroup?.message}
                {...register("tariffSubgroup")}
                defaultValue=""
            >
                <option value="" disabled>
                    Selecione
                </option>
                {(Object.entries(TARIFF_SUBGROUP_LABELS) as [TariffSubgroup, string][]).map(
                    ([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ),
                )}
            </Select>

            <Select
                label="Modalidade tarifária"
                helperText="Azul e Convencional Binômia chegam na Fase 20."
                error={errors.tariffModality?.message}
                {...register("tariffModality")}
                defaultValue="GREEN"
            >
                <option value="GREEN">Horária Verde</option>
            </Select>
        </div>

        <Input
            label="Demanda contratada · kW"
            type="number"
            step="1"
            min="30"
            placeholder="250"
            error={errors.contractedDemandKw?.message}
            {...register("contractedDemandKw")}
        />
    </div>
)

interface SectionProps {
    title: string
    description?: string
    children: React.ReactNode
}

const Section = ({ title, description, children }: SectionProps) => (
    <section className="flex flex-col gap-3">
        <header>
            <h2 className="text-text text-base font-semibold">{title}</h2>
            {description && <p className="text-muted mt-0.5 text-xs">{description}</p>}
        </header>
        {children}
    </section>
)
