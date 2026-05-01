import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { formatCnpj } from "@/lib/masks"
import {
    distributorFormSchema,
    type DistributorFormData,
    type DistributorFormInput,
} from "@/schemas/distributor.schema"
import {
    type Distributor,
    VALID_VOLTAGES,
    ELECTRICAL_SYSTEM_LABELS,
} from "@/types/distributor.types"

interface DistributorFormProps {
    /** Dados iniciais — quando presente, o form opera em modo edição */
    initialData?: Distributor
    /**
     * Callback de submit. Recebe os dados do form (com taxRate em
     * percentual). A página é responsável por converter taxRate→decimal
     * antes de mandar pro backend.
     */
    onSubmit: (data: DistributorFormData) => Promise<void>
    /** Callback de cancelamento — geralmente um navigate("..") */
    onCancel: () => void
    /** Texto do botão de submit. Default: "Salvar" */
    submitLabel?: string
}

/**
 * Form de distribuidora — usado em criação e edição.
 *
 * Diferenças entre os modos:
 *   - CRIAÇÃO (initialData=undefined): CNPJ editável, defaults vazios
 *   - EDIÇÃO (initialData=Distributor): CNPJ desabilitado, defaults preenchidos
 *
 * O form NÃO faz a conversão taxRate (% → decimal). Isso é responsabilidade
 * da página chamadora porque depende do contrato com o backend.
 */
export const DistributorForm = ({
    initialData,
    onSubmit,
    onCancel,
    submitLabel = "Salvar",
}: DistributorFormProps) => {
    const isEditing = Boolean(initialData)

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<DistributorFormInput, unknown, DistributorFormData>({
        resolver: zodResolver(distributorFormSchema),
        mode: "onBlur",
        defaultValues: initialData
            ? {
                name: initialData.name,
                cnpj: initialData.cnpj,
                electricalSystem: initialData.electricalSystem,
                workingVoltage: initialData.workingVoltage,
                kwhPrice: initialData.kwhPrice,
                // Backend → form: decimal → percentual
                taxRate:
                    initialData.taxRate !== null
                        ? initialData.taxRate * 100
                        : undefined,
                publicLightingFee: initialData.publicLightingFee ?? undefined,
            }
            : {
                name: "",
                cnpj: "",
            },
    })

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
        >
            <Input
                label="Nome da distribuidora"
                placeholder="CEMIG Distribuição S.A."
                error={errors.name?.message}
                {...register("name")}
            />

            <Input
                label="CNPJ"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                disabled={isEditing}
                helperText={
                    isEditing
                        ? "CNPJ não pode ser alterado após o cadastro"
                        : undefined
                }
                error={errors.cnpj?.message}
                {...register("cnpj", {
                    onChange: (e) => {
                        e.target.value = formatCnpj(e.target.value)
                        setValue("cnpj", e.target.value, {
                            shouldValidate: false,
                        })
                    },
                })}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                    label="Sistema elétrico"
                    error={errors.electricalSystem?.message}
                    {...register("electricalSystem")}
                    defaultValue={initialData?.electricalSystem ?? ""}
                >
                    <option value="" disabled>
                        Selecione
                    </option>
                    {(["MONOPHASIC", "BIPHASIC", "TRIPHASIC"] as const).map(
                        (sys) => (
                            <option key={sys} value={sys}>
                                {ELECTRICAL_SYSTEM_LABELS[sys]}
                            </option>
                        ),
                    )}
                </Select>

                <Select
                    label="Tensão de trabalho"
                    error={errors.workingVoltage?.message}
                    {...register("workingVoltage")}
                    defaultValue={initialData?.workingVoltage ?? ""}
                >
                    <option value="" disabled>
                        Selecione
                    </option>
                    {VALID_VOLTAGES.map((v) => (
                        <option key={v} value={v}>
                            {v} V
                        </option>
                    ))}
                </Select>
            </div>

            <Input
                label="Preço do kWh (R$)"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.75"
                error={errors.kwhPrice?.message}
                {...register("kwhPrice")}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                    label="Alíquota de impostos (%)"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="12"
                    helperText="Opcional. Ex: 12 para 12%"
                    error={errors.taxRate?.message}
                    {...register("taxRate")}
                />

                <Input
                    label="Iluminação pública (R$)"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="45.90"
                    helperText="Opcional"
                    error={errors.publicLightingFee?.message}
                    {...register("publicLightingFee")}
                />
            </div>

            <div className="mt-2 flex justify-end gap-2">
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