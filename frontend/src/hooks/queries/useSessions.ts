import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/queryClient"
import { sessionService } from "@/services/session.service"
import type { RevokeOtherSessionsResult, RevokeSessionResult } from "@/types/session.types"

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

/** Encerra uma sessão e recarrega a lista; o erro fica por conta de quem chama. */
export const useRevokeSession = () => {
    const queryClient = useQueryClient()

    return useMutation<RevokeSessionResult, Error, string>({
        mutationFn: (id) => sessionService.revoke(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
            toast.success("Sessão encerrada")
        },
    })
}

/** Encerra todas as outras sessões e recarrega a lista; o erro fica por conta de quem chama. */
export const useRevokeOtherSessions = () => {
    const queryClient = useQueryClient()

    return useMutation<RevokeOtherSessionsResult, Error, void>({
        mutationFn: () => sessionService.revokeOthers(),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
            toast.success("Sessões encerradas")
        },
    })
}
