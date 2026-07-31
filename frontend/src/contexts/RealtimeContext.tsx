import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { createAppStream, type ReadingPayload } from "@/lib/sse/appStream"
import { useAuth } from "@/contexts/AuthContext"
import { queryKeys } from "@/lib/queryClient"
import type { Notification } from "@/types/notification.types"

interface RealtimeContextValue {
    /** Última leitura elétrica recebida por medidor (`reading`, SSE). */
    readingsByMeterId: Record<string, ReadingPayload>
}

const RealtimeContext = createContext<RealtimeContextValue>({
    readingsByMeterId: {},
})

interface RealtimeProviderProps {
    children: ReactNode
}

/**
 * Mantém a conexão SSE única do app (`/api/iot/stream`) enquanto o usuário
 * está autenticado, e distribui os eventos:
 *
 *   - `reading`      → guardado em estado local por `meterId` (alta
 *     frequência, ~1/s por medidor — não faz sentido como React Query;
 *     `RealTimeCard` lê daqui via `useRealtime()`).
 *   - `alert-firing` → invalida `alerts.firing`/`alerts.all` (o REST já
 *     resolve status/target; SSE só avisa "algo mudou, refaça a query").
 *   - `notification` → escreve direto no cache de `notifications.list`
 *     (evita esperar um refetch) e dispara toast com ação de navegação.
 *   - `connected`    → no-op (reservado para indicador visual futuro).
 *
 * Montado uma única vez no `AppShell`, acima do Header e do conteúdo —
 * tanto `NotificationDropdown`/`WarningBadge` quanto `RealTimeCard`
 * consultam este contexto ou o cache do TanStack que ele mantém.
 */
export const RealtimeProvider = ({ children }: RealtimeProviderProps) => {
    const { user, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const navigate = useNavigate()
    const [readingsByMeterId, setReadingsByMeterId] = useState<
        Record<string, ReadingPayload>
    >({})

    useEffect(() => {
        if (!isAuthenticated || !user) return

        const cleanup = createAppStream({
            onReading: (reading) => {
                setReadingsByMeterId((prev) => ({
                    ...prev,
                    [reading.meterId]: reading,
                }))
            },

            onAlertFiring: () => {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.alerts.firing(),
                })
                queryClient.invalidateQueries({
                    queryKey: queryKeys.alerts.all,
                })
            },

            onNotification: (notification: Notification) => {
                queryClient.setQueryData<Notification[]>(
                    queryKeys.notifications.list(),
                    (old = []) => [notification, ...old],
                )

                toast.warning(notification.message, {
                    duration: 10_000,
                    action: {
                        label: "Ver",
                        onClick: () => navigate(notification.targetPath),
                    },
                })
            },

            onError: (error) => {
                // Erros de SSE são esperados (rede instável, backend
                // reinicia) — a lib reconecta sozinha. Não vale a pena
                // um toast ruidoso; só logamos em dev.
                if (import.meta.env.DEV) {
                    console.warn("[RealtimeContext] SSE error:", error)
                }
            },
        })

        return () => {
            cleanup()
            setReadingsByMeterId({})
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, isAuthenticated])

    return (
        <RealtimeContext.Provider value={{ readingsByMeterId }}>
            {children}
        </RealtimeContext.Provider>
    )
}

export const useRealtime = (): RealtimeContextValue => useContext(RealtimeContext)
