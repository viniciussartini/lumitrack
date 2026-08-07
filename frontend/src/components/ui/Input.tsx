import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/cn"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    helperText?: string
    /**
     * Mostra um botão de olho para alternar type="password" ↔ "text".
     * Só tem efeito quando type="password" (ver auth.spec.ts / prototype
     * LumiTrack Login.dc.html e Registro.dc.html — resolve a issue #2
     * legada, "Input Senha" sem opção de mostrar/ocultar).
     */
    revealable?: boolean
    /**
     * Conteúdo ao lado do label, mesma linha (ex.: link "Esqueceu a senha?"
     * — LumiTrack Login.dc.html). Opcional, só ocupa espaço quando usado.
     */
    labelExtra?: ReactNode
}

// forwardRef é necessário para o React Hook Form conseguir registrar
// o input via {...register("email")} — o RHF precisa da ref para
// gerenciar o valor sem usar useState.

export const Input = forwardRef<HTMLInputElement, InputProps>(
    (
        { label, error, helperText, labelExtra, className, id, type, revealable = false, ...rest },
        ref,
    ) => {
        const generatedId = useId()
        const inputId = id ?? generatedId
        const hasError = Boolean(error)
        const [visible, setVisible] = useState(false)

        const isPasswordToggle = revealable && type === "password"
        const effectiveType = isPasswordToggle ? (visible ? "text" : "password") : type

        return (
            <div className="field">
                {label &&
                    (labelExtra ? (
                        // .field > label (industry.css) exige filho DIRETO de
                        // .field — como o label some dentro deste wrapper
                        // flex, precisa repetir aqui o que a regra perderia:
                        // font-size/cor no label, margin-bottom na linha
                        // (que agora ocupa a posição que o label ocupava).
                        <div className="mb-[5px] flex items-baseline justify-between gap-3">
                            <label htmlFor={inputId} className="text-text/70 text-xs">
                                {label}
                            </label>
                            {labelExtra}
                        </div>
                    ) : (
                        <label htmlFor={inputId}>{label}</label>
                    ))}
                <div className="relative flex items-center">
                    <input
                        id={inputId}
                        ref={ref}
                        type={effectiveType}
                        aria-invalid={hasError}
                        aria-describedby={
                            hasError
                                ? `${inputId}-error`
                                : helperText
                                  ? `${inputId}-helper`
                                  : undefined
                        }
                        className={cn(
                            "input lt-input w-full",
                            isPasswordToggle && "pr-11",
                            hasError && "border-status-danger",
                            className,
                        )}
                        {...rest}
                    />
                    {isPasswordToggle && (
                        <button
                            type="button"
                            onClick={() => setVisible((v) => !v)}
                            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                            className="text-text/55 hover:text-text absolute right-1.5 inline-flex h-8 w-8 items-center justify-center border-0 bg-transparent"
                        >
                            {visible ? (
                                <EyeOff
                                    className="h-[18px] w-[18px]"
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                />
                            ) : (
                                <Eye
                                    className="h-[18px] w-[18px]"
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                />
                            )}
                        </button>
                    )}
                </div>
                {hasError ? (
                    <span
                        id={`${inputId}-error`}
                        role="alert"
                        className="text-status-danger text-xs"
                    >
                        {error}
                    </span>
                ) : helperText ? (
                    <span id={`${inputId}-helper`} className="text-muted text-xs">
                        {helperText}
                    </span>
                ) : null}
            </div>
        )
    },
)

Input.displayName = "Input"
