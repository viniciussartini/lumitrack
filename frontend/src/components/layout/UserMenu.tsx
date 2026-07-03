import { useRef, useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronDown, LogOut, Shield, User as UserIcon } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { cn } from "@/lib/cn"
import type { User } from "@/types/auth.types"

/**
 * Deriva um nome amigável e iniciais a partir do User.
 * PF: usa firstName + lastName.
 * PJ: usa tradeName se existir, senão companyName.
 * Iniciais: 1-2 caracteres em uppercase, fallback "?" se não der.
 */
const getDisplayInfo = (user: User): { name: string; initials: string } => {
    if (user.userType === "INDIVIDUAL") {
        const first = user.firstName ?? ""
        const last = user.lastName ?? ""
        const name = `${first} ${last}`.trim() || user.email
        const initials =
            (first[0] ?? "") + (last[0] ?? "") || user.email[0]
        return { name, initials: initials.toUpperCase() || "?" }
    }

    const name = user.tradeName ?? user.companyName ?? user.email
    const initials = name[0]?.toUpperCase() ?? "?"
    return { name, initials }
}

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
        navigate("/login", { replace: true })
    }

    if (!user) return null

    const { name, initials } = getDisplayInfo(user)

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger */}
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                    "dark:focus-visible:ring-offset-slate-950",
                )}
            >
                {/* Avatar com iniciais */}
                <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white"
                >
                    {initials}
                </span>
                {/* Nome — escondido em telas muito pequenas */}
                <span className="hidden max-w-35 truncate font-medium sm:inline">
                    {name}
                </span>
                <ChevronDown
                    className={cn(
                        "h-4 w-4 transition-transform",
                        isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    role="menu"
                    aria-label="Opções do usuário"
                    className={cn(
                        "absolute right-0 top-full mt-1 w-56 origin-top-right",
                        "rounded-md border border-slate-200 bg-white shadow-lg",
                        "dark:border-slate-800 dark:bg-slate-900",
                        "py-1",
                    )}
                >
                    {/* Header com email — não-clicável, contexto */}
                    <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {name}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {user.email}
                        </p>
                    </div>

                    {/* Item: Perfil (placeholder) */}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => setIsOpen(false)}
                        disabled
                        className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                            "text-slate-400 dark:text-slate-500",
                            "cursor-not-allowed",
                        )}
                    >
                        <UserIcon className="h-4 w-4" aria-hidden="true" />
                        Perfil <span className="ml-auto text-xs">(em breve)</span>
                    </button>

                    {/* Item: Segurança (MFA) */}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setIsOpen(false)
                            navigate("/seguranca")
                        }}
                        className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                            "text-slate-700 hover:bg-slate-100",
                            "dark:text-slate-200 dark:hover:bg-slate-800",
                        )}
                    >
                        <Shield className="h-4 w-4" aria-hidden="true" />
                        Segurança
                    </button>

                    {/* Item: Sair */}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                            "text-red-600 hover:bg-red-50",
                            "dark:text-red-400 dark:hover:bg-red-950/50",
                        )}
                    >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Sair
                    </button>
                </div>
            )}
        </div>
    )
}