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
    CONTRACTING_ENVIRONMENT_LABELS,
    ELECTRICAL_SYSTEM_LABELS,
    GROUP_B_MODALITY_LABELS,
    TARIFF_SUBGROUP_LABELS,
    VALID_UFS,
    type BillingClass,
    type ContractingEnvironment,
    type ElectricalSystem,
    type GroupBModality,
    type Property,
    type TariffGroup,
    type TariffModality,
    type TariffSubgroup,
} from "@/types/property.types"
import {
    ACL_ENERGY_SOURCE_LABELS,
    ACL_SUBMARKET_LABELS,
    type AclContract,
    type AclEnergySource,
    type AclSubmarket,
} from "@/types/acl-contract.types"
import type { Distributor } from "@/types/distributor.types"

interface PropertyFormProps {
    /** Dados iniciais — quando presente, o form opera em modo edição */
    initialData?: Property
    /**
     * Contrato ACL corrente da propriedade, se houver — só relevante em
     * edição de uma propriedade já em ACL. `undefined` em criação (nunca
     * existe contrato ainda) e em edição de propriedade sem contrato
     * cadastrado (o form cria um novo ao salvar).
     */
    initialAclContract?: AclContract
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
const buildDefaultValues = (
    initialData: Property | undefined,
    initialAclContract: AclContract | undefined,
): Partial<PropertyFormInput> =>
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
              groupBModality: initialData.groupBModality ?? undefined,
              receivesBillingDiscount: initialData.receivesBillingDiscount ?? undefined,
              tariffSubgroup: initialData.tariffSubgroup ?? undefined,
              tariffModality: initialData.tariffModality ?? undefined,
              contractedDemandKw: initialData.contractedDemandKw ?? undefined,
              contractedDemandPeakKw: initialData.contractedDemandPeakKw ?? undefined,
              contractedDemandOffPeakKw: initialData.contractedDemandOffPeakKw ?? undefined,
              publicLightingFeeBrl: initialData.publicLightingFeeBrl ?? undefined,
              contractingEnvironment: initialData.contractingEnvironment,
              aclRetailerName: initialAclContract?.retailerName ?? "",
              aclSubmarket: initialAclContract?.submarket,
              aclEnergySource: initialAclContract?.energySource,
              aclEnergyPricePerMwh: initialAclContract?.energyPricePerMwh,
              aclContractedVolumeMwh: initialAclContract?.contractedVolumeMwh,
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
              groupBModality: "CONVENTIONAL",
              receivesBillingDiscount: false,
              publicLightingFeeBrl: undefined,
              contractingEnvironment: "ACR",
          }

export const PropertyForm = ({
    initialData,
    initialAclContract,
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
        defaultValues: buildDefaultValues(initialData, initialAclContract),
    })

    const tariffGroup = watch("tariffGroup") as TariffGroup
    const isGroupA = tariffGroup === "GROUP_A"
    const isBlue = (watch("tariffModality") as TariffModality | undefined) === "BLUE"
    const isAcl = (watch("contractingEnvironment") as ContractingEnvironment | undefined) === "ACL"
    const billingClass = watch("billingClass") as BillingClass | undefined
    const isWhite = (watch("groupBModality") as GroupBModality | undefined) === "WHITE"

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
                    isBlue={isBlue}
                    isAcl={isAcl}
                    billingClass={billingClass}
                    isWhite={isWhite}
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
    isBlue: boolean
    isAcl: boolean
    billingClass: BillingClass | undefined
    isWhite: boolean
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
    isBlue,
    isAcl,
    billingClass,
    isWhite,
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
                            setValue("groupBModality", undefined)
                            setValue("receivesBillingDiscount", undefined)
                        } else {
                            setValue("tariffSubgroup", undefined)
                            setValue("tariffModality", undefined)
                            setValue("contractedDemandKw", undefined)
                            setValue("contractedDemandPeakKw", undefined)
                            setValue("contractedDemandOffPeakKw", undefined)
                            // ACL só se aplica ao Grupo A (assertContractingEnvironmentEligible,
                            // no backend) — trocar pro Grupo B teria que voltar pro
                            // cativo também, mesmo motivo dos outros campos exclusivos
                            // do Grupo A acima.
                            setValue("contractingEnvironment", "ACR")
                            setValue("aclRetailerName", undefined)
                            setValue("aclSubmarket", undefined)
                            setValue("aclEnergySource", undefined)
                            setValue("aclEnergyPricePerMwh", undefined)
                            setValue("aclContractedVolumeMwh", undefined)
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
            <GroupAFields register={register} errors={errors} setValue={setValue} isBlue={isBlue} />
        ) : (
            <GroupBFields
                register={register}
                errors={errors}
                setValue={setValue}
                initialData={initialData}
                billingClass={billingClass}
                isWhite={isWhite}
            />
        )}

        {isGroupA && (
            <Select
                label="Ambiente de contratação"
                helperText="Livre (ACL) exige o contrato de energia da comercializadora abaixo."
                error={errors.contractingEnvironment?.message}
                {...register("contractingEnvironment", {
                    onChange: (e) => {
                        if (e.target.value !== "ACL") {
                            setValue("aclRetailerName", undefined)
                            setValue("aclSubmarket", undefined)
                            setValue("aclEnergySource", undefined)
                            setValue("aclEnergyPricePerMwh", undefined)
                            setValue("aclContractedVolumeMwh", undefined)
                        }
                    },
                })}
                defaultValue={initialData?.contractingEnvironment ?? "ACR"}
            >
                {(
                    Object.entries(CONTRACTING_ENVIRONMENT_LABELS) as [
                        ContractingEnvironment,
                        string,
                    ][]
                ).map(([value, label]) => (
                    <option key={value} value={value}>
                        {label}
                    </option>
                ))}
            </Select>
        )}

        {isAcl && <AclContractFields register={register} errors={errors} />}

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

interface GroupBFieldsProps {
    register: UseFormRegister<PropertyFormInput>
    errors: FieldErrors<PropertyFormData>
    setValue: UseFormSetValue<PropertyFormInput>
    initialData: Property | undefined
    billingClass: BillingClass | undefined
    isWhite: boolean
}

/**
 * Campos exclusivos do Grupo B — classe de faturamento, modalidade
 * (Convencional/Branca) e o desconto que veda a Branca (baixa renda ou
 * outro desconto de faturamento), mesmo padrão de subcomponente condicional
 * de `GroupAFields` abaixo.
 *
 * Modalidade e desconto só aparecem para B1/B3 — B2 nunca teve Branca
 * caracterizada pelo documento de referência (corte de escopo, não vedação
 * normativa; ver roadmap Fase 22). Os dois onChange voltam a modalidade para
 * Convencional ao perder a elegibilidade (troca pra B2, ou marca o
 * desconto) — mesmo motivo dos onChange de `tariffGroup`/`tariffModality`
 * acima: RHF não desregistra campo desmontado, e o backend rejeitaria
 * "WHITE" com uma combinação que não é mais elegível.
 */
const GroupBFields = ({
    register,
    errors,
    setValue,
    initialData,
    billingClass,
    isWhite,
}: GroupBFieldsProps) => {
    const isWhiteEligible = billingClass === "B1" || billingClass === "B3"

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Select
                    label="Classe de faturamento"
                    error={errors.billingClass?.message}
                    {...register("billingClass", {
                        onChange: (e) => {
                            if (e.target.value !== "B1" && e.target.value !== "B3") {
                                setValue("groupBModality", "CONVENTIONAL")
                            }
                        },
                    })}
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

                <Select
                    label="Modalidade"
                    helperText={
                        isWhiteEligible
                            ? "Tarifa Branca cobra por posto (Ponta/Intermediário/Fora de Ponta)."
                            : "Tarifa Branca só está disponível para as classes B1 e B3."
                    }
                    disabled={!isWhiteEligible}
                    error={errors.groupBModality?.message}
                    {...register("groupBModality")}
                    defaultValue={initialData?.groupBModality ?? "CONVENTIONAL"}
                >
                    {(Object.entries(GROUP_B_MODALITY_LABELS) as [GroupBModality, string][]).map(
                        ([value, label]) => (
                            <option
                                key={value}
                                value={value}
                                disabled={value === "WHITE" && !isWhiteEligible}
                            >
                                {label}
                            </option>
                        ),
                    )}
                </Select>
            </div>

            <label className="flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    className="accent-accent h-4 w-4"
                    {...register("receivesBillingDiscount", {
                        onChange: (e) => {
                            if (e.target.checked) setValue("groupBModality", "CONVENTIONAL")
                        },
                    })}
                    defaultChecked={initialData?.receivesBillingDiscount ?? false}
                />
                Recebe baixa renda ou outro desconto de faturamento
            </label>

            {isWhite && (
                <p className="text-muted text-xs">
                    A conta será decomposta por posto tarifário (Ponta/Intermediário/Fora de Ponta)
                    em vez da tarifa plana — veja a decomposição na página da propriedade.
                </p>
            )}
        </div>
    )
}

interface GroupAFieldsProps {
    register: UseFormRegister<PropertyFormInput>
    errors: FieldErrors<PropertyFormData>
    setValue: UseFormSetValue<PropertyFormInput>
    isBlue: boolean
}

/**
 * Campos exclusivos do Grupo A — mostrados quando `tariffGroup` é
 * "GROUP_A" (ver `isGroupA` em `PropertyForm`), mesmo padrão de subcomponente
 * condicional de `MeterForm.tsx` (`MqttCredentialFields`).
 *
 * Modalidade oferece Verde e Azul — Convencional Binômia ainda não tem
 * cálculo de conta implementado no backend. Azul substitui a demanda única
 * por duas (ponta/fora de ponta): o onChange abaixo limpa o formato anterior
 * ao trocar de modalidade, mesmo motivo do onChange de `tariffGroup` acima
 * (RHF não desregistra campo desmontado, e o backend rejeita os dois
 * formatos preenchidos ao mesmo tempo).
 */
const GroupAFields = ({ register, errors, setValue, isBlue }: GroupAFieldsProps) => (
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
                helperText="Convencional Binômia ainda não está disponível."
                error={errors.tariffModality?.message}
                {...register("tariffModality", {
                    onChange: (e) => {
                        if (e.target.value === "BLUE") {
                            setValue("contractedDemandKw", undefined)
                        } else {
                            setValue("contractedDemandPeakKw", undefined)
                            setValue("contractedDemandOffPeakKw", undefined)
                        }
                    },
                })}
                defaultValue="GREEN"
            >
                <option value="GREEN">Horária Verde</option>
                <option value="BLUE">Horária Azul</option>
            </Select>
        </div>

        {isBlue ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                    label="Demanda contratada · ponta (kW)"
                    type="number"
                    step="1"
                    min="30"
                    placeholder="180"
                    error={errors.contractedDemandPeakKw?.message}
                    {...register("contractedDemandPeakKw")}
                />
                <Input
                    label="Demanda contratada · fora ponta (kW)"
                    type="number"
                    step="1"
                    min="30"
                    placeholder="250"
                    error={errors.contractedDemandOffPeakKw?.message}
                    {...register("contractedDemandOffPeakKw")}
                />
            </div>
        ) : (
            <Input
                label="Demanda contratada · kW"
                type="number"
                step="1"
                min="30"
                placeholder="250"
                error={errors.contractedDemandKw?.message}
                {...register("contractedDemandKw")}
            />
        )}
    </div>
)

interface AclContractFieldsProps {
    register: UseFormRegister<PropertyFormInput>
    errors: FieldErrors<PropertyFormData>
}

/**
 * Contrato de energia do Mercado Livre (ACL) — mostrado quando "Ambiente de
 * contratação" é Livre (ver `isAcl` em `PropertyForm`), mesmo padrão de
 * subcomponente condicional de `GroupAFields` acima.
 *
 * Sem campo de vigência (`validFrom`): o handoff de design não modela essa
 * data no form de propriedade — `PropertyFormDialog` preenche com a data
 * corrente ao criar o contrato, sem pedir isso ao usuário (contrato
 * cadastrado agora vale a partir de agora); editar um contrato existente
 * não altera a vigência já registrada.
 */
const AclContractFields = ({ register, errors }: AclContractFieldsProps) => (
    <div className="flex flex-col gap-4">
        <span className="font-heading text-accent-700 border-divider text-11 border-b pb-1.5 font-semibold tracking-[.07em] uppercase">
            Contrato de energia — Mercado Livre
        </span>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
                label="Comercializadora"
                placeholder="Ex.: Comerc Energia"
                error={errors.aclRetailerName?.message}
                {...register("aclRetailerName")}
            />
            <Select
                label="Submercado"
                error={errors.aclSubmarket?.message}
                {...register("aclSubmarket")}
                defaultValue=""
            >
                <option value="" disabled>
                    Selecione
                </option>
                {(Object.entries(ACL_SUBMARKET_LABELS) as [AclSubmarket, string][]).map(
                    ([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ),
                )}
            </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
                label="Preço da energia · R$/MWh"
                type="number"
                step="0.01"
                min="0"
                placeholder="280,00"
                error={errors.aclEnergyPricePerMwh?.message}
                {...register("aclEnergyPricePerMwh")}
            />
            <Input
                label="Volume contratado · MWh/mês"
                type="number"
                step="0.1"
                min="0"
                placeholder="120"
                error={errors.aclContractedVolumeMwh?.message}
                {...register("aclContractedVolumeMwh")}
            />
            <Select
                label="Fonte contratada"
                error={errors.aclEnergySource?.message}
                {...register("aclEnergySource")}
                defaultValue=""
            >
                <option value="" disabled>
                    Selecione
                </option>
                {(Object.entries(ACL_ENERGY_SOURCE_LABELS) as [AclEnergySource, string][]).map(
                    ([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ),
                )}
            </Select>
        </div>
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
