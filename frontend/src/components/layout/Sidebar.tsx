import { NavLink } from "react-router"
import { X } from "lucide-react"
import { NAV_ITEMS } from "@/config/navigation"
import { LumiTrackWordmark } from "@/components/ui/LumiTrackWordmark"
import { UserMenu } from "@/components/layout/UserMenu"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { cn } from "@/lib/cn"

interface SidebarProps {
    /** Sidebar aberta no mobile? Em desktop é sempre visível, ignora este flag. */
    isOpen: boolean
    /** Callback para fechar o drawer (mobile) */
    onClose: () => void
}

/** Divisor sutil sobre o fundo sempre-escuro da sidebar (--color-accent-900)
 *  — cor literal, não token: mesmo raciocínio do BrandPanel.tsx (painel
 *  sempre-escuro, independente do tema claro/escuro do resto do app). */
const SIDEBAR_DIVIDER = { borderColor: "color-mix(in srgb, #fff 12%, transparent)" }

/**
 * Sidebar com nav vertical — LumiTrack Home.dc.html, linhas 61-77.
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
                "bg-accent-900 fixed inset-y-0 left-0 z-40 flex w-64 flex-col",
                // Animação de slide em mobile
                "transition-transform duration-200 ease-out",
                isOpen ? "translate-x-0" : "-translate-x-full",
                // Em desktop: estática, sempre visível
                "md:static md:translate-x-0",
            )}
        >
            {/* Cabeçalho da sidebar — logo + close (mobile only) */}
            <div
                className="flex items-center justify-between gap-2.5 border-b px-[18px] pt-[22px] pb-[18px]"
                style={SIDEBAR_DIVIDER}
            >
                <LumiTrackWordmark textClassName="text-[19px]" />

                {/* Botão fechar — só em mobile */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fechar menu"
                    className="inline-flex h-8 w-8 items-center justify-center text-[#d7e0ea] hover:bg-white/6 md:hidden"
                >
                    <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                </button>
            </div>

            {/* Lista de links */}
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto py-3.5">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon
                    return (
                        <NavLink key={item.to} to={item.to} end className="lt-navitem">
                            <Icon
                                className="h-[17px] w-[17px] shrink-0"
                                strokeWidth={1.5}
                                aria-hidden="true"
                            />
                            <span>{item.label}</span>
                        </NavLink>
                    )
                })}
            </nav>

            {/* Rodapé — identidade do usuário (trigger do UserMenu) + tema */}
            <div className="flex items-center gap-[11px] border-t p-3.5" style={SIDEBAR_DIVIDER}>
                <div className="min-w-0 flex-1">
                    <UserMenu variant="sidebar" />
                </div>
                <ThemeToggle className="shrink-0 border border-white/26 text-[#d7e0ea] hover:bg-white/6" />
            </div>
        </aside>
    </>
)
