import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Bell, Check } from "lucide-react"
import { toast } from "sonner"
import {
    useDeleteAllNotifications,
    useDeleteNotification,
    useNotifications,
} from "@/hooks/queries/useNotifications"
import { useClickOutside } from "@/lib/hooks/useClickOutside"
import { extractErrorMessage } from "@/services/api"
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
 * Três formas de "consumir" uma notificação:
 *   - Clicar no corpo → navega para `targetPath` (o medidor/alerta que
 *     disparou) e a exclui.
 *   - Clicar no ícone de check → só exclui (marca como lida), sem navegar.
 *   - "Marcar todas como lidas" (cabeçalho, spec do handoff — LumiTrack
 *     Home.dc.html, bloco NOTIFICATIONS DROPDOWN) → exclui todas de uma vez.
 *     Oculto sem notificações — divergência deliberada do protótipo (que
 *     mostra o botão mesmo vazio): a ação não faz sentido sem alvo.
 */
export const NotificationDropdown = () => {
    const { data: notifications = [] } = useNotifications()
    const deleteNotification = useDeleteNotification()
    const deleteAllNotifications = useDeleteAllNotifications()
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
        void navigate(notification.targetPath)
        deleteNotification.mutate(notification.id)
    }

    const handleDismiss = (id: string) => {
        deleteNotification.mutate(id)
    }

    const handleMarkAllRead = () => {
        // Ação em lote: falhar silenciosamente aqui é mais confuso do que no
        // dismiss individual — o usuário não sabe se marcou 0, algumas ou
        // todas as notificações.
        deleteAllNotifications.mutate(undefined, {
            onError: (error) => {
                toast.error("Erro ao marcar notificações como lidas", {
                    description: extractErrorMessage(error),
                })
            },
        })
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
                    className="lt-menu top-full right-0 mt-1 flex max-h-96 w-80 flex-col overflow-y-auto"
                >
                    {/* `role="presentation"`: filho direto de `role="menu"` que não é
                        `menuitem`/`group`/`separator` — sem isso, a estrutura ARIA
                        esperada de um menu fica inconsistente. Os itens abaixo
                        continuam `<button>` sem `role="menuitem"`. */}
                    <div
                        role="presentation"
                        className="border-divider flex items-center justify-between gap-2.5 border-b px-4 py-3.5"
                    >
                        <span className="font-heading text-[15px] font-semibold uppercase">
                            Notificações
                        </span>
                        {count > 0 && (
                            <button
                                type="button"
                                onClick={handleMarkAllRead}
                                data-testid="notification-mark-all-read"
                                className="text-accent-700 cursor-pointer border-0 bg-transparent p-0 text-xs hover:underline"
                            >
                                Marcar todas como lidas
                            </button>
                        )}
                    </div>

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
                                    <Check
                                        className="h-4 w-4"
                                        strokeWidth={1.5}
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
