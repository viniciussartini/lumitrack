import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { areaFormSchema, type AreaFormData, type AreaFormInput } from "@/schemas/area.schema"
import type { Area } from "@/types/area.types"
import { cn } from "@/lib/cn"

interface AreaFormProps {
    /** Dados iniciais — quando presente, o form opera em modo edição */
    initialData?: Area
    /** Callback de submit. Recebe os dados validados e transformados. */
    onSubmit: (data: AreaFormData) => Promise<void>
    /** Callback de cancelamento — geralmente um navigate("..") */
    onCancel: () => void
    /** Texto do botão de submit. Default: "Salvar" */
    submitLabel?: string
}

/**
 * Form de área — usado em criação e edição.
 *
 * Diferenças entre os modos:
 *   - CRIAÇÃO (initialData=undefined): defaults vazios
 *   - EDIÇÃO (initialData=Area): nome preenchido, descrição null→"" convertido
 *
 * Forma simples — só dois campos (nome obrigatório, descrição opcional). Por
 * isso não precisa de subdivisão em "Sections" como o PropertyForm.
 *
 * Não recebe propertyId — o pai (NewAreaPage / EditAreaPage) tem o param da
 * rota e monta o payload na hora do submit. Isso mantém o form puro: ele só
 * vê os campos que o usuário edita.
 */
export const AreaForm = ({
    initialData,
    onSubmit,
    onCancel,
    submitLabel = "Salvar",
}: AreaFormProps) => {
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<AreaFormInput, unknown, AreaFormData>({
        resolver: zodResolver(areaFormSchema),
        mode: "onBlur",
        defaultValues: initialData
            ? {
                  name: initialData.name,
                  // null → "" porque <input> não aceita null; o schema converte
                  // string vazia de volta pra undefined antes do submit
                  description: initialData.description ?? "",
              }
            : {
                  name: "",
                  description: "",
              },
    })

    return (
        <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            className="flex flex-col gap-6"
            noValidate
        >
            <div className="flex flex-col gap-4">
                <Input label="Nome da área" error={errors.name?.message} {...register("name")} />

                <div className="field">
                    <label htmlFor="description">
                        Descrição
                        <span className="text-muted ml-1 text-xs font-normal">(opcional)</span>
                    </label>
                    <textarea
                        id="description"
                        rows={4}
                        className={cn(
                            "input lt-input",
                            errors.description && "border-status-danger",
                        )}
                        placeholder="Ex.: Sala principal, com TV e sistema de som."
                        {...register("description")}
                    />
                    {errors.description?.message && (
                        <p role="alert" className="text-status-danger text-xs">
                            {errors.description.message}
                        </p>
                    )}
                </div>
            </div>

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
