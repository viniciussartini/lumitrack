import { useState, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { extractErrorMessage } from "@/services/api"
import { mfaCodeSchema, type MfaCodeFormData } from "@/schemas/mfa.schema"

interface MfaCodeFormProps {
    description: ReactNode
    submitLabel: string
    onSubmit: (code: string) => Promise<void>
    onCancel?: () => void
    cancelLabel?: string
}

/**
 * Form de um único campo (código TOTP de 6 dígitos ou código de backup),
 * reutilizado no segundo passo do login (LoginPage) e na confirmação do
 * setup de MFA (SecurityPage) — o backend aceita o mesmo formato de campo
 * nos dois casos.
 */
export const MfaCodeForm = ({
    description,
    submitLabel,
    onSubmit,
    onCancel,
    cancelLabel = "Cancelar",
}: MfaCodeFormProps) => {
    const [serverError, setServerError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<MfaCodeFormData>({
        resolver: zodResolver(mfaCodeSchema),
        mode: "onBlur",
    })

    const handleFormSubmit = async (data: MfaCodeFormData): Promise<void> => {
        setServerError(null)
        try {
            await onSubmit(data.code)
        } catch (error) {
            setServerError(extractErrorMessage(error))
        }
    }

    return (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-4" noValidate>
            <p className="text-muted text-sm">{description}</p>

            <Input
                label="Código de verificação"
                autoComplete="one-time-code"
                placeholder="000000 ou XXXXX-XXXXX"
                error={errors.code?.message}
                autoFocus
                {...register("code")}
            />

            {serverError && (
                <div
                    role="alert"
                    className="bg-status-danger/10 text-status-danger px-3 py-2 text-sm"
                >
                    {serverError}
                </div>
            )}

            <div className="flex gap-2">
                {onCancel && (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onCancel}
                        disabled={isSubmitting}
                    >
                        {cancelLabel}
                    </Button>
                )}
                <Button
                    type="submit"
                    isLoading={isSubmitting}
                    className={onCancel ? "flex-1" : "w-full"}
                >
                    {submitLabel}
                </Button>
            </div>
        </form>
    )
}
