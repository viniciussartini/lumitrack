import { Menu } from "lucide-react"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { UserMenu } from "@/components/layout/UserMenu"
import { cn } from "@/lib/cn"

interface HeaderProps {
    /** Callback chamado pelo botão hamburger (abre a sidebar em mobile) */
    onMenuClick: () => void
}

/**
 * Cabeçalho horizontal do app autenticado.
 *
 * Layout (esquerda → direita):
 *   - Hamburger (só em mobile)
 *   - Spacer (flex-1)
 *   - ThemeToggle
 *   - UserMenu
 *
 * Em desktop o hamburger some — a sidebar já está visível.
 */
export const Header = ({ onMenuClick }: HeaderProps) => (
    <header
        className={cn(
            "flex h-16 items-center gap-2 border-b border-slate-200 bg-white px-4",
            "dark:border-slate-800 dark:bg-slate-900",
        )}
    >
        {/* Hamburger — abre sidebar em mobile */}
        <button
            type="button"
            onClick={onMenuClick}
            aria-label="Abrir menu"
            className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden",
                "text-slate-700 hover:bg-slate-100",
                "dark:text-slate-200 dark:hover:bg-slate-800",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                "dark:focus-visible:ring-offset-slate-950",
            )}
        >
            <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="flex-1" />

        <ThemeToggle />
        <UserMenu />
    </header>
)