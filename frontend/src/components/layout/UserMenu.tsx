import { useRef, useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { LogOut, Shield, User as UserIcon } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { getDisplayInfo } from "@/lib/userDisplay"

/**
 * Trigger: bloco de identidade do rodapé da Sidebar (avatar maior + nome +
 * tipo de conta), LumiTrack Home.dc.html linhas 69-76 — o protótipo só
 * navega direto pro Perfil nesse bloco, mas aqui ele vira o trigger deste
 * mesmo menu, por decisão deliberada: o protótipo não tem logout em lugar
 * nenhum, então precisa continuar acessível por Perfil / Segurança / Sair.
 */
export const UserMenu = () => {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Fecha ao clicar fora — o ref engloba o trigger E o menu,
    // assim o click no trigger não conta como "fora"
    useClickOutside(containerRef, () => setIsOpen(false))

    // Fecha com Escape — atalho de acessibilidade padrão
    useEffect(() => {
        if (!isOpen) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false)
            }
        }

        document.addEventListener("keydown", handleEscape)
        return () => {
            document.removeEventListener("keydown", handleEscape)
        }
    }, [isOpen])

    const handleLogout = async (): Promise<void> => {
        setIsOpen(false)
        await logout()
        void navigate("/login", { replace: true })
    }

    if (!user) return null

    const { name, initials, accountTypeLabel } = getDisplayInfo(user)

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger */}
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-label={`Menu do usuário ${name}`}
                className="flex w-full items-center gap-[11px] text-left transition-colors hover:bg-white/6"
            >
                <span
                    aria-hidden="true"
                    className="font-heading text-15 flex h-9 w-9 shrink-0 items-center justify-center border border-white/26 font-semibold text-[#e6ecf2]"
                >
                    {initials}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="text-13-5 block truncate font-semibold text-[#e6ecf2]">
                        {name}
                    </span>
                    <span className="text-11-5 block truncate text-[#d7e0ea]/55">
                        {accountTypeLabel}
                    </span>
                </span>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    role="menu"
                    aria-label="Opções do usuário"
                    className="lt-menu bottom-full left-0 mb-2 w-56"
                >
                    {/* Header com email — não-clicável, contexto */}
                    <div className="border-divider border-b px-4 py-3">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="text-muted truncate text-xs">{user.email}</p>
                    </div>

                    {/* Item: Perfil */}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setIsOpen(false)
                            void navigate("/perfil")
                        }}
                        className="lt-menu-item"
                    >
                        <UserIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                        Perfil
                    </button>

                    {/* Item: Segurança (MFA) */}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setIsOpen(false)
                            void navigate("/seguranca")
                        }}
                        className="lt-menu-item"
                    >
                        <Shield className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                        Segurança
                    </button>

                    {/* Item: Sair */}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleLogout()}
                        className="lt-menu-item lt-menu-item-danger"
                    >
                        <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                        Sair
                    </button>
                </div>
            )}
        </div>
    )
}
