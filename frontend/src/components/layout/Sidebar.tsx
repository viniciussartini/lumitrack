import { NavLink } from "react-router"
import { Zap, X } from "lucide-react"
import { NAV_ITEMS } from "@/config/navigation"
import { cn } from "@/lib/cn"

interface SidebarProps {
    /** Sidebar aberta no mobile? Em desktop é sempre visível, ignora este flag. */
    isOpen: boolean
    /** Callback para fechar o drawer (mobile) */
    onClose: () => void
}

/**
 * Sidebar com nav vertical.
 *
 * Mobile (< md):
 *   - Off-canvas: fixed inset-y-0 left-0, fora da tela por padrão
 *   - Translada para dentro quando isOpen=true
 *   - Backdrop semi-transparente atrás
 *
 * Desktop (>= md):
 *   - Fixa à esquerda do flex container do AppShell
 *   - Sempre visível, ignora isOpen
 */
export const Sidebar = ({ isOpen, onClose }: SidebarProps) => (
    <>
        {/* Backdrop — só em mobile, só quando aberta */}
        <div
            data-testid="sidebar-backdrop"
            onClick={onClose}
            className={cn(
                "fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden",
                isOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden="true"
        />

        {/* Painel da sidebar */}
        <aside
            aria-label="Navegação principal"
            className={cn(
                // Layout base
                "fixed inset-y-0 left-0 z-40 flex w-64 flex-col",
                "border-r border-slate-200 bg-white",
                "dark:border-slate-800 dark:bg-slate-900",
                // Animação de slide em mobile
                "transition-transform duration-200 ease-out",
                isOpen ? "translate-x-0" : "-translate-x-full",
                // Em desktop: estática, sempre visível
                "md:static md:translate-x-0",
            )}
        >
            {/* Cabeçalho da sidebar — logo + close (mobile only) */}
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-500">
                        <Zap className="h-5 w-5 text-white" aria-hidden="true" />
                    </div>
                    <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        LumiTrack
                    </span>
                </div>

                {/* Botão fechar — só em mobile */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fechar menu"
                    className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-md md:hidden",
                        "text-slate-600 hover:bg-slate-100",
                        "dark:text-slate-300 dark:hover:bg-slate-800",
                    )}
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>

            {/* Lista de links */}
            <nav className="flex-1 overflow-y-auto px-3 py-4">
                <ul className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon
                        return (
                            <li key={item.to}>
                                <NavLink
                                    to={item.to}
                                    end
                                    className={({ isActive }) =>
                                        cn(
                                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                                            "transition-colors",
                                            isActive
                                                ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-500"
                                                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                                        )
                                    }
                                >
                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                    <span>{item.label}</span>
                                </NavLink>
                            </li>
                        )
                    })}
                </ul>
            </nav>
        </aside>
    </>
)