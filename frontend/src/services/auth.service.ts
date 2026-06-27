import { api } from "@/services/api"
import type {
    LoginInput,
    LoginResponse,
    RegisterInput,
    User,
} from "@/types/auth.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

export const authService = {
    /**
     * Login. O backend seta os cookies httpOnly de sessão e CSRF; o JWT
     * nunca chega a JS. Em seguida busca o usuário completo via /auth/me
     * (o id não está mais disponível para decodificação local).
     * O channel é fixo "WEB" — o app mobile usaria "MOBILE".
     */
    login: async (input: LoginInput): Promise<User> => {
        await api.post<ApiEnvelope<LoginResponse>>(
            "/auth/login",
            { ...input, channel: "WEB" },
        )

        const { data } = await api.get<ApiEnvelope<User>>("/auth/me")
        return data.data
    },

    /**
     * Logout. Revoga o token no backend (cookie + CSRF enviados
     * automaticamente pelos interceptors de api.ts), que também limpa os
     * cookies httpOnly/CSRF na resposta.
     */
    logout: async (): Promise<void> => {
        try {
            await api.post("/auth/logout")
        } catch {
            // Ignora — o pior cenário é o usuário ficar deslogado localmente
            // mesmo que a revogação no backend tenha falhado (rede caiu).
        }
    },

    /**
     * Busca o usuário autenticado via cookie/sessão atual. Retorna null se
     * não houver sessão (401) — usado no boot da app para restaurar o
     * estado de autenticação sem decodificar nada no cliente.
     */
    getCurrentUser: async (): Promise<User | null> => {
        try {
            const { data } = await api.get<ApiEnvelope<User>>("/auth/me")
            return data.data
        } catch {
            return null
        }
    },

    /**
     * Cria uma nova conta. Retorna o User criado.
     * O backend valida exaustivamente — em caso de erro propaga 422
     * (validação) ou 409 (email duplicado).
     *
     * NOTA: este método NÃO faz login. O auto-login é responsabilidade
     * do AuthContext.register, que orquestra register + login.
     */
    register: async (input: RegisterInput): Promise<User> => {
        const { data } = await api.post<ApiEnvelope<User>>("/users", input)
        return data.data
    },
}
