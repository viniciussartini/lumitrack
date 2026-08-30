import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useNavigate, type NavigateFunction } from "react-router"
import { toast } from "sonner"
import { createAppStream, type AppStreamOptions, type ReadingPayload } from "@/lib/sse/appStream"
import { useAuth } from "@/contexts/AuthContext"
import { queryKeys } from "@/lib/queryClient"
import type { Notification } from "@/types/notification.types"

interface RealtimeConnectionContextValue {
    /**
     * Conexão SSE aberta agora? Consumido pelo badge "Dados ao vivo" do
     * Header — o badge só existe quando isto é `true`; nunca fica pintado
     * fixo, porque um badge "ao vivo" com o stream caído mente sobre a
     * frescura do dado.
     */
    isConnected: boolean
}

interface RealtimeReadingsContextValue {
    /** Última leitura elétrica recebida por medidor (`reading`, SSE). */
    readingsByMeterId: Record<string, ReadingPayload>
}

// Dois contextos, não um: `isConnected` muda raro (só em open/erro) e
// `readingsByMeterId` muda a ~1Hz por medidor. Num único contexto, todo
// consumidor de `isConnected` (ex.: `Header`) re-renderizaria na mesma
// frequência de quem lê as leituras — mesmo sem usar esse dado.
const RealtimeConnectionContext = createContext<RealtimeConnectionContextValue>({
    isConnected: false,
})

const RealtimeReadingsContext = createContext<RealtimeReadingsContextValue>({
    readingsByMeterId: {},
})

interface RealtimeProviderProps {
    children: ReactNode
}

interface StreamHandlerDeps {
    queryClient: QueryClient
    navigate: NavigateFunction
    setIsConnected: (value: boolean) => void
    setReadingsByMeterId: (
        updater: (prev: Record<string, ReadingPayload>) => Record<string, ReadingPayload>,
    ) => void
}

/**
 * Handlers dos eventos SSE — extraído do corpo de `RealtimeProvider` só pra
 * manter a função do componente enxuta; a lógica de cada evento continua a
 * mesma.
 */
const buildStreamHandlers = ({
    queryClient,
    navigate,
    setIsConnected,
    setReadingsByMeterId,
}: StreamHandlerDeps): AppStreamOptions => ({
    onOpen: () => setIsConnected(true),

    onReading: (reading) => {
        setReadingsByMeterId((prev) => ({ ...prev, [reading.meterId]: reading }))
    },

    onAlertFiring: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.firing() })
        void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
    },

    onNotification: (notification: Notification) => {
        queryClient.setQueryData<Notification[]>(queryKeys.notifications.list(), (old = []) => [
            notification,
            ...old,
        ])

        toast.warning(notification.message, {
            duration: 10_000,
            action: {
                label: "Ver",
                onClick: () => void navigate(notification.targetPath),
            },
        })
    },

    onError: (error) => {
        // Erros de SSE são esperados (rede instável, backend reinicia) — a
        // lib reconecta sozinha. Não vale a pena um toast ruidoso; só
        // logamos em dev.
        setIsConnected(false)
        if (import.meta.env.DEV) {
            console.warn("[RealtimeContext] SSE error:", error)
        }
    },
})

/**
 * Mantém a conexão SSE única do app (`/api/iot/stream`) enquanto o usuário
 * está autenticado, e distribui os eventos:
 *
 *   - `reading`      → guardado em estado local por `meterId` (alta
 *     frequência, ~1/s por medidor — não faz sentido como React Query;
 *     `MeterSection`/`PropertyDetailsPage` leem daqui via `useRealtimeReadings()`).
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

        const cleanup = createAppStream(
            buildStreamHandlers({ queryClient, navigate, setIsConnected, setReadingsByMeterId }),
        )

        return () => {
            cleanup()
            setReadingsByMeterId({})
            setIsConnected(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, isAuthenticated])

    // Memoização explícita, não deixada por conta do React Compiler: os dois
    // objetos de `value` são recriados a cada render de `RealtimeProvider`
    // (disparado por QUALQUER um dos dois estados mudando) — sem isso, o
    // contexto de conexão continuaria recriando seu `value` toda vez que uma
    // leitura chegasse, e a separação em dois contextos não isolaria nada.
    const connectionValue = useMemo(() => ({ isConnected }), [isConnected])
    const readingsValue = useMemo(() => ({ readingsByMeterId }), [readingsByMeterId])

    return (
        <RealtimeConnectionContext.Provider value={connectionValue}>
            <RealtimeReadingsContext.Provider value={readingsValue}>
                {children}
            </RealtimeReadingsContext.Provider>
        </RealtimeConnectionContext.Provider>
    )
}

export const useRealtimeConnection = (): RealtimeConnectionContextValue =>
    useContext(RealtimeConnectionContext)

export const useRealtimeReadings = (): RealtimeReadingsContextValue =>
    useContext(RealtimeReadingsContext)
