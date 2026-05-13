import { Link } from "react-router-dom"
import { Bell } from "lucide-react"
import { useAlerts } from "@/hooks/queries/useAlerts"
import { cn } from "@/lib/cn"

/**
 * Sino de notificações no Header com badge de contagem.
 *
 * Mostra o número de alertas DISPARADOS-NÃO-LIDOS (triggeredAt !== null
 * && readAt === null). Reutiliza o cache do `useAlerts()` global —
 * mesma query que a AlertsPage usa, então não há request extra.
 *
 * Navegação: clicar leva pra /alertas?triggered=true (filtro "Disparados").
 * O URL sync garante que o filtro já vem ativo na inbox.
 *
 * Estados visuais:
 *   - 0 não-lidos: sino limpo, sem badge
 *   - 1-99: badge com número
 *   - 100+: badge "99+"  (evita estourar layout)
 *
 * Sobre invisibilidade do badge:
 *   - Quando count=0, não renderizamos o badge (em vez de visibility:hidden)
 *     pra deixar o sino sozinho — UX mais limpa, sem espaço reservado.
 *
 * Acessibilidade:
 *   - Link tem aria-label dinâmico ("3 alertas não lidos" / "Nenhum alerta
 *     pendente"), pra leitores de tela contextualizarem.
 *   - O ícone Bell é aria-hidden — o label do link já comunica o significado.
 */
export const AlertBellBadge = () => {
    const { data: alerts = [] } = useAlerts()

    const unreadCount = alerts.filter(
        (alert) => alert.triggeredAt !== null && alert.readAt === null,
    ).length

    const ariaLabel =
        unreadCount === 0
            ? "Alertas — nenhum pendente"
            : unreadCount === 1
                ? "1 alerta não lido"
                : `${unreadCount} alertas não lidos`

    const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount)

    return (
        <Link
            to="/alertas?triggered=true"
            aria-label={ariaLabel}
            data-testid="alert-bell-badge"
            data-unread-count={unreadCount}
            className={cn(
                "relative inline-flex h-9 w-9 items-center justify-center rounded-md",
                "text-slate-700 hover:bg-slate-100",
                "dark:text-slate-200 dark:hover:bg-slate-800",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                "dark:focus-visible:ring-offset-slate-950",
            )}
        >
            <Bell className="h-5 w-5" aria-hidden="true" />

            {unreadCount > 0 && (
                <span
                    data-testid="alert-bell-badge-count"
                    className={cn(
                        "absolute -right-0.5 -top-0.5 inline-flex min-w-4.5 items-center justify-center",
                        "rounded-full bg-red-500 px-1 text-[0.625rem] font-semibold leading-none text-white",
                        "ring-2 ring-white dark:ring-slate-900",
                    )}
                >
                    {badgeLabel}
                </span>
            )}
        </Link>
    )
}