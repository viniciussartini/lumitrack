import { jwtDecode } from "jwt-decode"
import { api } from "@/services/api"
import { storage, STORAGE_KEYS } from "@/lib/storage"
import type {
    JwtPayload,
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
     * Login. Persiste o token no storage e retorna o payload decodificado.
     * O channel é fixo "WEB" — o app mobile usaria "MOBILE".
     */
    login: async (input: LoginInput): Promise<JwtPayload> => {
        const { data } = await api.post<ApiEnvelope<LoginResponse>>(
            "/auth/login",
            { ...input, channel: "WEB" },
        )

        const token = data.data.token
        storage.set(STORAGE_KEYS.TOKEN, token)

        return jwtDecode<JwtPayload>(token)
    },

    /**
     * Logout. Revoga o token no backend e limpa o storage local.
     * Se o backend falhar (rede caiu, token já inválido), limpa o storage
     * mesmo assim — o pior cenário é o usuário ficar deslogado, o que é
     * exatamente o que ele pediu.
     */
    logout: async (): Promise<void> => {
        try {
            await api.post("/auth/logout")
        } catch {
            // Ignora — vamos limpar local de qualquer forma
        }
        storage.remove(STORAGE_KEYS.TOKEN)
    },

    /**
     * Hidrata os dados completos do usuário pelo ID do JWT.
     * Usado depois do login e no boot da app (se já tiver token salvo).
     */
    fetchCurrentUser: async (userId: string): Promise<User> => {
        const { data } = await api.get<ApiEnvelope<User>>(`/users/${userId}`)
        return data.data
    },

    /**
     * Lê o token do storage e decodifica. Retorna null se não houver
     * ou se o token estiver expirado (para tokens WEB).
     */
    getStoredSession: (): JwtPayload | null => {
        const token = storage.get(STORAGE_KEYS.TOKEN)
        if (!token) return null

        try {
            const payload = jwtDecode<JwtPayload>(token)

            if (payload.exp && payload.exp * 1000 < Date.now()) {
                storage.remove(STORAGE_KEYS.TOKEN)
                return null
            }

            return payload
        } catch {
            storage.remove(STORAGE_KEYS.TOKEN)
            return null
        }
    },

    /**
     * Cria uma nova conta. Retorna o User criado.
     * O backend valida exaustivamente — em caso de erro propaga 422
     * (validação) ou 409 (email duplicado).
     *
     * NOTA: este método NÃO faz login. O auto-login é responsabilidade
     * do AuthContext.register, que orquestra register + login + fetch.
     */
    register: async (input: RegisterInput): Promise<User> => {
        const { data } = await api.post<ApiEnvelope<User>>("/users", input)
        return data.data
    },
}