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

/**
 * Grid 2 colunas + caixa de check 14×14 — fiel ao protótipo
 * LumiTrack Registro.dc.html (renderVals/reqList: caixa com borda/fundo na
 * cor de status success quando atendido, "✓" branco dentro; texto mudo
 * quando não atendido). Tamanhos em px arbitrários porque o protótipo não
 * os deriva da escala de espaçamento (14px/12.5px/7px, não múltiplos de
 * --space-1).
 */
export const PasswordRequirements = ({ password }: PasswordRequirementsProps) => (
    <ul aria-label="Requisitos da senha" className="grid grid-cols-2 gap-[7px]">
        {REQUIREMENTS.map((req) => {
            const met = req.test(password)
            return (
                <li
                    key={req.label}
                    className={cn(
                        "flex items-center gap-[7px] text-[12.5px]",
                        met ? "text-status-success" : "text-muted",
                    )}
                >
                    <span
                        aria-hidden="true"
                        data-met={met}
                        className={cn(
                            "flex h-[14px] w-[14px] shrink-0 items-center justify-center border text-[9px] text-white",
                            met ? "bg-status-success border-status-success" : "border-text/30 bg-transparent",
                        )}
                    >
                        {met ? "✓" : ""}
                    </span>
                    <span>{req.label}</span>
                </li>
            )
        })}
    </ul>
)