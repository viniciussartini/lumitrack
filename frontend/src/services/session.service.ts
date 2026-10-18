import { api } from "@/services/api"
import type { RevokeOtherSessionsResult, RevokeSessionResult, Session } from "@/types/session.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/** Camada de acesso a `/api/sessions` — sessões ativas da conta. */
export const sessionService = {
    /**
     * Sessões ativas do usuário autenticado, a atual primeiro.
     *
     * @returns As sessões, sem token nem hash.
     */
    list: async (): Promise<Session[]> => {
        const { data } = await api.get<ApiEnvelope<{ items: Session[] }>>("/sessions")
        return data.data.items
    },

    /**
     * Encerra uma sessão da conta: os tokens dela deixam de valer na hora.
     *
     * @param id - Id da sessão (não é o de nenhum token).
     * @returns Se a sessão encerrada era a de quem pediu.
     */
    revoke: async (id: string): Promise<RevokeSessionResult> => {
        const { data } = await api.delete<ApiEnvelope<RevokeSessionResult>>(`/sessions/${id}`)
        return data.data
    },

    /**
     * Encerra todas as sessões da conta, menos a atual.
     *
     * @returns Quantas sessões foram encerradas.
     */
    revokeOthers: async (): Promise<RevokeOtherSessionsResult> => {
        const { data } =
            await api.post<ApiEnvelope<RevokeOtherSessionsResult>>("/sessions/revoke-others")
        return data.data
    },
}
