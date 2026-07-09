import { api } from "@/services/api"
import { getRefreshCsrfToken } from "@/lib/csrf"
import type {
    LoginInput,
    LoginResponse,
    LoginResult,
    MfaDisableInput,
    MfaLoginVerifyInput,
    MfaSetupResponse,
    MfaVerifySetupInput,
    MfaVerifySetupResponse,
    RegisterInput,
    User,
} from "@/types/auth.types"

interface ApiEnvelope<T> {
    status: "success"
    data: T
}

export const authService = {
    /**
     * Login. Quando a conta tem MFA habilitado, o backend não emite sessão
     * ainda — retorna `mfaRequired:true` + um `mfaToken` de 5min, e o
     * segundo passo (verifyMfaLogin) é quem efetivamente autentica. Sem
     * MFA, o backend já seta os cookies httpOnly de sessão e CSRF; o JWT
     * nunca chega a JS, então buscamos o usuário completo via /auth/me
     * (o id não está mais disponível para decodificação local).
     * O channel é fixo "WEB" — o app mobile usaria "MOBILE".
     */
    login: async (input: LoginInput): Promise<LoginResult> => {
        const { data } = await api.post<ApiEnvelope<LoginResponse>>(
            "/auth/login",
            { ...input, channel: "WEB" },
        )

        if (data.data.mfaRequired && data.data.mfaToken) {
            return { mfaRequired: true, mfaToken: data.data.mfaToken }
        }

        const { data: meData } = await api.get<ApiEnvelope<User>>("/auth/me")
        return { user: meData.data }
    },

    /**
     * Segundo passo do login quando a conta tem MFA habilitado. `code`
     * aceita tanto um TOTP de 6 dígitos quanto um código de backup
     * (formato XXXXX-XXXXX). Em caso de sucesso, o backend seta os cookies
     * de sessão exatamente como um login normal — mesmo padrão de
     * `login()`: busca o usuário completo via /auth/me em seguida.
     */
    verifyMfaLogin: async (input: MfaLoginVerifyInput): Promise<User> => {
        await api.post<ApiEnvelope<LoginResponse>>("/auth/login/mfa", input)

        const { data } = await api.get<ApiEnvelope<User>>("/auth/me")
        return data.data
    },

    /**
     * Inicia a configuração de MFA para o usuário autenticado. Nada é
     * persistido nesta chamada — o secret só é gravado quando confirmado
     * via mfaVerifySetup. Retorna o secret (para digitação manual) e um QR
     * code pronto (data URL PNG) para escanear no app autenticador.
     */
    mfaSetup: async (): Promise<MfaSetupResponse> => {
        const { data } = await api.post<ApiEnvelope<MfaSetupResponse>>(
            "/auth/mfa/setup",
        )
        return data.data
    },

    /**
     * Confirma o código gerado a partir do secret recebido em mfaSetup e
     * ativa o MFA na conta. Retorna os 10 códigos de backup em texto
     * plano — única vez que ficam visíveis, nunca mais recuperáveis depois
     * (persistidos como hash).
     */
    mfaVerifySetup: async (
        input: MfaVerifySetupInput,
    ): Promise<MfaVerifySetupResponse> => {
        const { data } = await api.post<ApiEnvelope<MfaVerifySetupResponse>>(
            "/auth/mfa/verify-setup",
            input,
        )
        return data.data
    },

    /**
     * Desativa o MFA. Exige senha atual + um código válido (TOTP ou
     * backup) — dupla confirmação porque desativar reduz a segurança da
     * conta.
     */
    mfaDisable: async (input: MfaDisableInput): Promise<void> => {
        await api.post("/auth/mfa/disable", input)
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
     * Renova a sessão WEB via refresh token httpOnly. Não retorna dados —
     * o backend sobrescreve os cookies de sessão. O header CSRF de refresh
     * é injetado manualmente (o interceptor genérico de api.ts usa o CSRF
     * de sessão, que pode estar expirado neste momento).
     */
    refresh: async (): Promise<void> => {
        const refreshCsrf = getRefreshCsrfToken()
        await api.post(
            "/auth/refresh",
            {},
            { headers: { "x-refresh-csrf-token": refreshCsrf ?? "" } },
        )
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
