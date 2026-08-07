import { useRef, useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { ChevronDown, LogOut, Shield, User as UserIcon } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { getDisplayInfo } from "@/lib/userDisplay"
import { cn } from "@/lib/cn"

interface UserMenuProps {
    /**
     * "header": pill compacto do Header (avatar + nome + chevron), trigger original.
     * "sidebar": bloco de identidade do rodapé da Sidebar (avatar maior +
     * nome + tipo de conta), LumiTrack Home.dc.html linhas 69-76 — o
     * protótipo só navega direto pro Perfil nesse bloco, mas aqui ele vira
     * o trigger deste mesmo menu (decisão do usuário, 2026-08-04): o
     * protótipo não tem logout em lugar nenhum, então precisa continuar
     * acessível por Perfil / Segurança / Sair.
     */
    variant?: "header" | "sidebar"
}

export const UserMenu = ({ variant = "header" }: UserMenuProps) => {
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
        navigate("/login", { replace: true })
    }

    if (!user) return null

    const { name, initials, accountTypeLabel } = getDisplayInfo(user)

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger */}
            {variant === "sidebar" ? (
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
                        className="font-heading flex h-9 w-9 shrink-0 items-center justify-center border border-white/26 text-[15px] font-semibold text-[#e6ecf2]"
                    >
                        {initials}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-[#e6ecf2]">
                            {name}
                        </span>
                        <span className="block truncate text-[11.5px] text-[#d7e0ea]/55">
                            {accountTypeLabel}
                        </span>
                    </span>
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => setIsOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-label={`Menu do usuário ${name}`}
                    className={cn(
                        "inline-flex items-center gap-2 rounded-md px-2 py-1.5",
                        "text-sm text-slate-700 hover:bg-slate-100",
                        "dark:text-slate-200 dark:hover:bg-slate-800",
                        "transition-colors",
                        "focus-visible:ring-brand-500 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                        "dark:focus-visible:ring-offset-slate-950",
                    )}
                >
                    {/* Avatar com iniciais */}
                    <span
                        aria-hidden="true"
                        className="bg-accent flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                    >
                        {initials}
                    </span>
                    {/* Nome — escondido em telas muito pequenas */}
                    <span className="hidden max-w-35 truncate font-medium sm:inline">{name}</span>
                    <ChevronDown
                        className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                        aria-hidden="true"
                    />
                </button>
            )}

            {/* Dropdown */}
            {isOpen && (
                <div
                    role="menu"
                    aria-label="Opções do usuário"
                    className={cn(
                        "lt-menu w-56",
                        variant === "sidebar" ? "bottom-full left-0 mb-2" : "top-full right-0 mt-1",
                    )}
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
                            navigate("/perfil")
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
                            navigate("/seguranca")
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
                        onClick={handleLogout}
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
