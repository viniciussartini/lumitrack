import { api } from "@/services/api"
import type { Session } from "@/types/session.types"

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
}
