import { Check, X } from "lucide-react"
import { cn } from "@/lib/cn"

interface PasswordRequirementsProps {
    /** Senha atualmente digitada */
    password: string
}

interface Requirement {
    label: string
    test: (password: string) => boolean
}

/**
 * Os critérios espelham o backend (shared/validation/passwordSchema.ts):
 *   - mín 8 caracteres
 *   - 1 maiúscula
 *   - 1 minúscula
 *   - 1 número
 *   - 1 caractere especial
 *
 * Mantenha sincronizado se o backend mudar.
 */
const REQUIREMENTS: readonly Requirement[] = [
    { label: "Pelo menos 8 caracteres", test: (p) => p.length >= 8 },
    { label: "Uma letra maiúscula", test: (p) => /[A-Z]/.test(p) },
    { label: "Uma letra minúscula", test: (p) => /[a-z]/.test(p) },
    { label: "Um número", test: (p) => /[0-9]/.test(p) },
    { label: "Um caractere especial", test: (p) => /[^A-Za-z0-9]/.test(p) },
] as const

export const PasswordRequirements = ({ password }: PasswordRequirementsProps) => (
    <ul aria-label="Requisitos da senha" className="flex flex-col gap-1">
        {REQUIREMENTS.map((req) => {
            const met = req.test(password)
            const Icon = met ? Check : X
            return (
                <li
                    key={req.label}
                    className={cn(
                        "flex items-center gap-2 text-xs",
                        met
                            ? "text-success dark:text-success"
                            : "text-slate-500 dark:text-slate-400",
                    )}
                >
                    <Icon
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                        data-met={met}
                    />
                    <span>{req.label}</span>
                </li>
            )
        })}
    </ul>
)