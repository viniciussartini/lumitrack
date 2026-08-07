import { Menu } from "lucide-react"
import { useLocation } from "react-router"
import { NotificationDropdown } from "@/components/layout/NotificationDropdown"
import { WarningBadge } from "@/components/layout/WarningBadge"
import { useAuth } from "@/contexts/AuthContext"
import { useRealtime } from "@/contexts/RealtimeContext"
import { getPageTitle } from "@/config/pageTitles"
import { getGreetingName } from "@/lib/userDisplay"

interface HeaderProps {
    /** Callback chamado pelo botão hamburger (abre a sidebar em mobile) */
    onMenuClick: () => void
}

/**
 * Cabeçalho horizontal do app autenticado — LumiTrack Home.dc.html,
 * linhas 83-97. ThemeToggle e UserMenu saíram daqui para o rodapé da
 * Sidebar (#135); no lugar entrou o título contextual da página.
 *
 * Layout (esquerda → direita):
 *   - Hamburger (só em mobile) + kicker/título da rota atual
 *   - Badge "Dados ao vivo" (só quando o SSE está conectado) + WarningBadge
 *     + NotificationDropdown
 */
export const Header = ({ onMenuClick }: HeaderProps) => {
    const location = useLocation()
    const { user } = useAuth()
    const { isConnected } = useRealtime()

    const { kicker, title } = getPageTitle(location.pathname)
    const isDashboard = location.pathname === "/dashboard"
    const greetingName = isDashboard && user ? getGreetingName(user) : null
    const pageTitle = isDashboard && user ? `Olá${greetingName ? `, ${greetingName}` : ""}!` : title

    return (
        <header
            className="border-divider sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b px-[clamp(20px,3vw,36px)] py-[18px] backdrop-blur-sm"
            style={{ background: "color-mix(in srgb, var(--color-bg) 92%, transparent)" }}
        >
            <div className="flex min-w-0 items-center gap-3">
                {/* Hamburger — abre sidebar em mobile */}
                <button
                    type="button"
                    onClick={onMenuClick}
                    aria-label="Abrir menu"
                    className="lt-iconbtn shrink-0 md:hidden"
                >
                    <Menu className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
                </button>

                <div className="min-w-0">
                    <span className="font-heading text-accent-700 block text-xs font-semibold tracking-[.08em] uppercase">
                        {kicker}
                    </span>
                    <h1 className="font-heading mt-2 truncate text-[clamp(22px,2.4vw,30px)] leading-[1.05] font-semibold uppercase">
                        {pageTitle}
                    </h1>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {isConnected && (
                    <span className="font-heading text-status-success inline-flex items-center gap-[7px] text-[11px] font-semibold tracking-[.07em] uppercase">
                        <span
                            aria-hidden="true"
                            className="bg-status-success inline-block h-2 w-2 rounded-full"
                            style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                        />
                        Dados ao vivo
                    </span>
                )}
                <WarningBadge />
                <NotificationDropdown />
            </div>
        </header>
    )
}
