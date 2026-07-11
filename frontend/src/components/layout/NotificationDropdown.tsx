import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, Check } from "lucide-react"
import {
    useDeleteNotification,
    useNotifications,
} from "@/hooks/queries/useNotifications"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { cn } from "@/lib/cn"
import type { Notification } from "@/types/notification.types"

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
})

/**
 * Sino de notificações — evolução do antigo `AlertBellBadge` (Fase 5).
 * Notificações são efêmeras (backend, `NotificationStore`): "lida" = excluída.
 *
 * Duas formas de "consumir" uma notificação:
 *   - Clicar no corpo → navega para `targetPath` (o medidor/alerta que
 *     disparou) e a exclui.
 *   - Clicar no ícone de check → só exclui (marca como lida), sem navegar.
 */
export const NotificationDropdown = () => {
    const { data: notifications = [] } = useNotifications()
    const deleteNotification = useDeleteNotification()
    const navigate = useNavigate()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useClickOutside(containerRef, () => setIsOpen(false))

    useEffect(() => {
        if (!isOpen) return
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsOpen(false)
        }
        document.addEventListener("keydown", handleEscape)
        return () => document.removeEventListener("keydown", handleEscape)
    }, [isOpen])

    const count = notifications.length
    const badgeLabel = count > 99 ? "99+" : String(count)

    const handleNavigate = (notification: Notification) => {
        setIsOpen(false)
        navigate(notification.targetPath)
        deleteNotification.mutate(notification.id)
    }

    const handleDismiss = (id: string) => {
        deleteNotification.mutate(id)
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-label={
                    count === 0
                        ? "Notificações — nenhuma pendente"
                        : count === 1
                        ? "1 notificação"
                        : `${count} notificações`
                }
                data-testid="notification-bell"
                data-count={count}
                className={cn(
                    "relative inline-flex h-9 w-9 items-center justify-center rounded-md",
                    "text-slate-700 hover:bg-slate-100",
                    "dark:text-slate-200 dark:hover:bg-slate-800",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                    "dark:focus-visible:ring-offset-slate-950",
                )}
            >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {count > 0 && (
                    <span
                        data-testid="notification-bell-count"
                        className={cn(
                            "absolute -right-0.5 -top-0.5 inline-flex min-w-4.5 items-center justify-center",
                            "rounded-full bg-red-500 px-1 text-[0.625rem] font-semibold leading-none text-white",
                            "ring-2 ring-white dark:ring-slate-900",
                        )}
                    >
                        {badgeLabel}
                    </span>
                )}
            </button>

            {isOpen && (
                <div
                    role="menu"
                    aria-label="Notificações"
                    data-testid="notification-dropdown"
                    className={cn(
                        "absolute right-0 top-full z-40 mt-1 w-80 max-w-[90vw] origin-top-right",
                        "rounded-md border border-slate-200 bg-white shadow-lg",
                        "dark:border-slate-800 dark:bg-slate-900",
                        "max-h-96 overflow-y-auto py-1",
                    )}
                >
                    {notifications.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                            Nenhuma notificação
                        </p>
                    ) : (
                        notifications.map((notification) => (
                            <div
                                key={notification.id}
                                className={cn(
                                    "flex items-start gap-2 border-b border-slate-100 px-3 py-2 last:border-0",
                                    "dark:border-slate-800",
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleNavigate(notification)}
                                    data-testid={`notification-item-${notification.id}`}
                                    className={cn(
                                        "flex-1 rounded-md p-1 text-left text-sm",
                                        "text-slate-700 hover:bg-slate-100",
                                        "dark:text-slate-200 dark:hover:bg-slate-800",
                                    )}
                                >
                                    <p>{notification.message}</p>
                                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                        {dateTimeFormatter.format(
                                            new Date(notification.createdAt),
                                        )}
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDismiss(notification.id)}
                                    aria-label="Marcar como lida"
                                    data-testid={`notification-dismiss-${notification.id}`}
                                    className={cn(
                                        "shrink-0 rounded-md p-1.5 text-slate-400",
                                        "hover:bg-slate-100 hover:text-slate-700",
                                        "dark:hover:bg-slate-800 dark:hover:text-slate-200",
                                    )}
                                >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
