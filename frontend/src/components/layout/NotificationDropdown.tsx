import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Bell, Check } from "lucide-react"
import {
    useDeleteNotification,
    useNotifications,
} from "@/hooks/queries/useNotifications"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
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
                title="Notificações"
                className="lt-iconbtn"
            >
                <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
                {count > 0 && (
                    <span data-testid="notification-bell-count" className="lt-iconbtn-badge">
                        {badgeLabel}
                    </span>
                )}
            </button>

            {isOpen && (
                <div
                    role="menu"
                    aria-label="Notificações"
                    data-testid="notification-dropdown"
                    className="lt-menu right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto"
                >
                    {notifications.length === 0 ? (
                        <p className="text-muted px-4 py-6 text-center text-sm">
                            Nenhuma notificação
                        </p>
                    ) : (
                        notifications.map((notification) => (
                            <div
                                key={notification.id}
                                className="border-divider flex items-start border-t first:border-t-0"
                            >
                                <button
                                    type="button"
                                    onClick={() => handleNavigate(notification)}
                                    data-testid={`notification-item-${notification.id}`}
                                    className="lt-menu-item min-w-0 flex-1 border-t-0"
                                >
                                    <span className="min-w-0 flex-1 text-left">
                                        <span className="block">{notification.message}</span>
                                        <span className="text-muted mt-0.5 block text-xs">
                                            {dateTimeFormatter.format(
                                                new Date(notification.createdAt),
                                            )}
                                        </span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDismiss(notification.id)}
                                    aria-label="Marcar como lida"
                                    data-testid={`notification-dismiss-${notification.id}`}
                                    className="btn btn-ghost btn-icon my-1 mr-1 shrink-0"
                                >
                                    <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
