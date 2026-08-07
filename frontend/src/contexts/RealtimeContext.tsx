import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
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
    /**
     * Conexão SSE aberta agora? Consumido pelo badge "Dados ao vivo" do
     * Header — decisão do usuário (2026-08-04): o badge só
     * existe quando isto é `true`; nunca fica pintado fixo, porque um
     * badge "ao vivo" com o stream caído mente sobre a frescura do dado.
     */
    isConnected: boolean
}

const RealtimeContext = createContext<RealtimeContextValue>({
    readingsByMeterId: {},
    isConnected: false,
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
 *     `MeterSection`/`PropertyDetailsPage` leem daqui via `useRealtime()`).
 *   - `alert-firing` → invalida `alerts.firing`/`alerts.all` (o REST já
 *     resolve status/target; SSE só avisa "algo mudou, refaça a query").
 *   - `notification` → escreve direto no cache de `notifications.list`
 *     (evita esperar um refetch) e dispara toast com ação de navegação.
 *
 * `isConnected` reflete o estado real do transporte, não um evento
 * específico: fica `true` quando `onOpen` dispara (handshake SSE
 * concluído) e `false` em qualquer `onError` — a lib do `fetch-event-source`
 * reconecta sozinha em erros não-fatais, então "false" aqui já cobre tanto
 * a queda quanto a janela de retry, sem precisar de um estado à parte.
 *
 * Montado uma única vez no `AppShell`, acima do Header e do conteúdo —
 * tanto `NotificationDropdown`/`WarningBadge` quanto `MeterSection`
 * consultam este contexto ou o cache do TanStack que ele mantém.
 */
export const RealtimeProvider = ({ children }: RealtimeProviderProps) => {
    const { user, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const navigate = useNavigate()
    const [readingsByMeterId, setReadingsByMeterId] = useState<Record<string, ReadingPayload>>({})
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        // Nada a fazer sem sessão — `isConnected` já começa `false`
        // (useState inicial) e, se veio de uma sessão conectada, o cleanup
        // do efeito anterior (abaixo) já zerou antes deste corpo rodar.
        if (!isAuthenticated || !user) return

        const cleanup = createAppStream({
            onOpen: () => {
                setIsConnected(true)
            },

            onReading: (reading) => {
                setReadingsByMeterId((prev) => ({
                    ...prev,
                    [reading.meterId]: reading,
                }))
            },

            onAlertFiring: () => {
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.alerts.firing(),
                })
                void queryClient.invalidateQueries({
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
                        onClick: () => void navigate(notification.targetPath),
                    },
                })
            },

            onError: (error) => {
                // Erros de SSE são esperados (rede instável, backend
                // reinicia) — a lib reconecta sozinha. Não vale a pena
                // um toast ruidoso; só logamos em dev.
                setIsConnected(false)
                if (import.meta.env.DEV) {
                    console.warn("[RealtimeContext] SSE error:", error)
                }
            },
        })

        return () => {
            cleanup()
            setReadingsByMeterId({})
            setIsConnected(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, isAuthenticated])

    return (
        <RealtimeContext.Provider value={{ readingsByMeterId, isConnected }}>
            {children}
        </RealtimeContext.Provider>
    )
}

export const useRealtime = (): RealtimeContextValue => useContext(RealtimeContext)
