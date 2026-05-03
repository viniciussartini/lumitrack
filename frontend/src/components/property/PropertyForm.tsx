import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { formatCep } from "@/lib/masks"
import { cn } from "@/lib/cn"
import {
    propertyFormSchema,
    type PropertyFormData,
    type PropertyFormInput,
} from "@/schemas/property.schema"
import { type Property, VALID_UFS } from "@/types/property.types"
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
        formState: { errors, isSubmitting },
    } = useForm<PropertyFormInput, unknown, PropertyFormData>({
        resolver: zodResolver(propertyFormSchema),
        mode: "onBlur",
        defaultValues: initialData
            ? {
                distributorId: initialData.distributorId,
                name: initialData.name,
                // null → "" porque <input> não aceita null; o schema converte
                // string vazia de volta pra undefined antes do submit.
                address: initialData.address ?? "",
                city: initialData.city ?? "",
                state: initialData.state ?? "",
                zipCode: initialData.zipCode ?? "",
            }
            : {
                distributorId: "",
                name: "",
                address: "",
                city: "",
                state: "",
                zipCode: "",
            },
    })

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
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

            <Section
                title="Endereço"
                description="Todos os campos de endereço são opcionais."
            >
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
                                    setValue("zipCode", e.target.value, {
                                        shouldValidate: false,
                                    })
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
            </Section>

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

// Subcomponente local

interface SectionProps {
    title: string
    description?: string
    children: React.ReactNode
}

const Section = ({ title, description, children }: SectionProps) => (
    <section className="flex flex-col gap-3">
        <header>
            <h2
                className={cn(
                    "text-base font-semibold",
                    "text-slate-900 dark:text-slate-100",
                )}
            >
                {title}
            </h2>
            {description && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {description}
                </p>
            )}
        </header>
        {children}
    </section>
)