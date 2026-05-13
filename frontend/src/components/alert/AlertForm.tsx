import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { cn } from "@/lib/cn"
import {
    alertFormSchema,
    type AlertFormData,
    type AlertFormInput,
} from "@/schemas/alert.schema"
import type { Alert } from "@/types/alert.types"

interface AlertFormProps {
    /** Dados iniciais — quando presente, o form opera em modo edição */
    initialData?: Alert
    /** Callback de submit. Recebe os dados validados e transformados. */
    onSubmit: (data: AlertFormData) => Promise<void>
    /** Callback de cancelamento — geralmente onClose do dialog */
    onCancel: () => void
    /** Texto do botão de submit. Default: "Salvar" */
    submitLabel?: string
}

/**
 * Form de Alerta — usado em criação e edição.
 *
 * Diferenças entre os modos:
 *   - CRIAÇÃO (initialData=undefined): defaults vazios, autofocus no threshold
 *   - EDIÇÃO (initialData=Alert): campos preenchidos. null → "" no message
 *     pra <textarea> não reclamar; o schema converte "" → undefined no submit.
 *
 * Em UPDATE, ambos os campos (threshold e message) são editáveis. Não há
 * campo "identificador" imutável como em consumption (que tinha period +
 * referenceDate disabled). Isso simplifica o form — único schema cobre
 * os dois modos.
 *
 * Aviso de "one-shot" em modo edição:
 *   Quando o alerta JÁ disparou (triggeredAt !== null), editar o threshold
 *   NÃO reaviva o disparo — o backend é one-shot. O AlertRowMenu
 *   já oculta "Editar" em alertas disparados, mas se em algum cenário
 *   excepcional o form for aberto com um alerta disparado, mostramos um
 *   banner orientando o usuário.
 *
 * Não recebe target (property/area/device) — o pai (AlertFormDialog) tem
 * essa info e monta a mutation correta. O form é puro: só vê os campos
 * que o usuário edita.
 */
export const AlertForm = ({
    initialData,
    onSubmit,
    onCancel,
    submitLabel = "Salvar",
}: AlertFormProps) => {
    const isEditMode = Boolean(initialData)
    const isAlreadyTriggered = Boolean(initialData?.triggeredAt)

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<AlertFormInput, unknown, AlertFormData>({
        resolver: zodResolver(alertFormSchema),
        mode: "onBlur",
        defaultValues: initialData
            ? {
                thresholdKwh: String(initialData.thresholdKwh),
                // null → "" porque <textarea> não aceita null; o schema
                // converte string vazia de volta pra undefined antes do submit
                message: initialData.message ?? "",
            }
            : {
                thresholdKwh: "",
                message: "",
            },
    })

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
        >
            {/* Banner one-shot — quando editando alerta JÁ disparado */}
            {isEditMode && isAlreadyTriggered && (
                <div
                    role="status"
                    data-testid="alert-form-triggered-warning"
                    className={cn(
                        "rounded-md border p-3 text-xs",
                        "border-amber-200 bg-amber-50 text-amber-900",
                        "dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
                    )}
                >
                    Este alerta já disparou. Editar o limite{" "}
                    <strong>não fará</strong> ele disparar novamente — para
                    receber novo aviso, exclua e crie outro.
                </div>
            )}

            {/* Threshold (kWh) */}
            <Input
                label="Limite de consumo (kWh)"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                autoFocus
                placeholder="100"
                helperText="Você será notificado quando o consumo ultrapassar este valor."
                error={errors.thresholdKwh?.message}
                data-testid="alert-form-thresholdKwh"
                {...register("thresholdKwh")}
            />

            {/* Message (opcional) */}
            <div className="flex flex-col gap-1">
                <label
                    htmlFor="alert-form-message"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                    Mensagem
                    <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                        (opcional)
                    </span>
                </label>
                <textarea
                    id="alert-form-message"
                    data-testid="alert-form-message"
                    {...register("message")}
                    rows={3}
                    maxLength={500}
                    placeholder="Ex.: Verificar se algum aparelho ficou ligado durante a noite."
                    aria-invalid={errors.message ? "true" : "false"}
                    className={cn(
                        "rounded-md border bg-white px-3 py-2 text-sm shadow-sm",
                        "border-slate-300 text-slate-900 placeholder:text-slate-400",
                        "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
                        "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500",
                        "resize-none",
                        errors.message &&
                            "border-red-500 focus:border-red-500 focus:ring-red-500",
                    )}
                />
                {errors.message && (
                    <p
                        className="text-xs text-red-600 dark:text-red-400"
                        role="alert"
                    >
                        {errors.message.message}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    data-testid="alert-form-cancel"
                >
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    isLoading={isSubmitting}
                    data-testid="alert-form-submit"
                >
                    {submitLabel}
                </Button>
            </div>
        </form>
    )
}