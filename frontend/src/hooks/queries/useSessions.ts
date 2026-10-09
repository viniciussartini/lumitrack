import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryClient"
import { sessionService } from "@/services/session.service"

/**
 * Sessões ativas da conta. Recarrega ao abrir a página: a lista muda por
 * ações fora desta aba (login em outro aparelho), e o cache de 30 s da
 * aplicação mostraria uma lista velha.
 */
export const useSessions = () =>
    useQuery({
        queryKey: queryKeys.sessions.list(),
        queryFn: () => sessionService.list(),
        refetchOnMount: "always",
    })
