import { api } from "@/services/api"
import type { UpdateUserInput, User } from "@/types/auth.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

/**
 * Camada de acesso a `PUT /api/users/:id` — usada pela edição de perfil
 * (ProfilePage). A leitura do usuário logado não passa por aqui: o
 * `AuthContext` já a resolve via `authService.getCurrentUser` (`/auth/me`).
 */
export const userService = {
    update: async (id: string, input: UpdateUserInput): Promise<User> => {
        const { data } = await api.put<ApiEnvelope<User>>(`/users/${id}`, input)
        return data.data
    },
}
