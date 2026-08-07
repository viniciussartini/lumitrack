import { cn } from "@/lib/cn"

export type RecoveryStep = "request" | "sent" | "reset"

const ORDER: readonly RecoveryStep[] = ["request", "sent", "reset"] as const

const STEPS: readonly { key: RecoveryStep; label: string }[] = [
    { key: "request", label: "Informe o e-mail cadastrado" },
    { key: "sent", label: "Confira o link enviado" },
    { key: "reset", label: "Defina uma nova senha" },
] as const

interface RecoveryStepsProps {
    current: RecoveryStep
}

/**
 * Indicador de progresso do fluxo de recuperação de senha (painel de marca
 * de LumiTrack Recuperar Senha.dc.html) — 3 passos, cor conforme
 * ativo/concluído/pendente. ForgotPasswordPage cobre request/sent;
 * ResetPasswordPage só é alcançável (token real por e-mail) com os dois
 * primeiros já concluídos.
 */
export const RecoverySteps = ({ current }: RecoveryStepsProps) => {
    const currentIndex = ORDER.indexOf(current)

    return (
        <ol className="mt-[30px] flex list-none flex-col gap-4 p-0">
            {STEPS.map((step, i) => {
                const status = i === currentIndex ? "active" : i < currentIndex ? "done" : "idle"
                return (
                    <li
                        key={step.key}
                        className="flex items-center gap-[13px] text-sm text-[#e6ecf2]/88"
                    >
                        <span
                            className={cn(
                                "lt-step",
                                status === "active" &&
                                    "text-status-highlight border-status-highlight",
                                status === "done" && "border-[#8fd0a0] text-[#8fd0a0]",
                                status === "idle" && "border-white/34 text-white/34",
                            )}
                        >
                            {i + 1}
                        </span>
                        {step.label}
                    </li>
                )
            })}
        </ol>
    )
}
