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

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="description"
                        className={cn("text-sm font-medium", "text-slate-700 dark:text-slate-300")}
                    >
                        Descrição
                        <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                            (opcional)
                        </span>
                    </label>
                    <textarea
                        id="description"
                        rows={4}
                        className={cn(
                            "rounded-md border bg-white px-3 py-2 text-sm shadow-sm",
                            "border-slate-300 text-slate-900",
                            "placeholder:text-slate-400",
                            "focus:border-brand-500 focus:ring-brand-500 focus:ring-1 focus:outline-none",
                            "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                            "dark:placeholder:text-slate-500",
                            errors.description &&
                                "border-red-500 focus:border-red-500 focus:ring-red-500",
                        )}
                        placeholder="Ex.: Sala principal, com TV e sistema de som."
                        {...register("description")}
                    />
                    {errors.description?.message && (
                        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                            {errors.description.message}
                        </p>
                    )}
                </div>
            </div>

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
