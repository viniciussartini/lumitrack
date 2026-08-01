import { Sun, Moon, Monitor } from "lucide-react"
import { useTheme, type Theme } from "@/contexts/ThemeContext"
import { cn } from "@/lib/cn"

const THEME_ORDER: readonly Theme[] = ["light", "dark", "system"] as const

const THEME_LABELS: Record<Theme, string> = {
    light: "claro",
    dark: "escuro",
    system: "sistema",
}

const nextTheme = (current: Theme): Theme => {
    const idx = THEME_ORDER.indexOf(current)
    return THEME_ORDER[(idx + 1) % THEME_ORDER.length]
}

interface ThemeToggleProps {
    className?: string
}

/**
 * Botão único que cicla entre light → dark → system → light.
 * O ícone reflete o tema *atualmente selecionado* (não o resolvido) —
 * isto é, em "system" mostra o ícone de monitor, mesmo que o resolved
 * seja dark. Isso comunica melhor a intenção do user.
 */
export const ThemeToggle = ({ className }: ThemeToggleProps) => {
    const { theme, setTheme } = useTheme()

    const handleClick = (): void => {
        setTheme(nextTheme(theme))
    }

    const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label={`Tema atual: ${THEME_LABELS[theme]}. Clique para alternar.`}
            className={cn("btn btn-ghost btn-icon", className)}
        >
            <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
        </button>
    )
}
