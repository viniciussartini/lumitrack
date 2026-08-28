import { api, ensureFreshSession } from "@/services/api"
import type {
    DemoProfile,
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
     *
     * @param input Credenciais de login.
     * @returns O usuário autenticado, ou `mfaRequired`+`mfaToken` se o
     *   segundo fator ainda precisa ser verificado.
     */
    login: async (input: LoginInput): Promise<LoginResult> => {
        const { data } = await api.post<ApiEnvelope<LoginResponse>>("/auth/login", {
            ...input,
            channel: "WEB",
        })

        if (data.data.mfaRequired && data.data.mfaToken) {
            return { mfaRequired: true, mfaToken: data.data.mfaToken }
        }

        const { data: meData } = await api.get<ApiEnvelope<User>>("/auth/me")
        return { user: meData.data }
    },

    /**
     * Login de demonstração — sem e-mail/senha no cliente, só o perfil
     * escolhido. O backend resolve a conta demo internamente e
     * gate por DEMO_LOGIN_ENABLED; se desligado, `api.post` rejeita com
     * 403 e o erro propaga como qualquer outra falha de login. Mesma forma
     * de resposta de `login()` (pode vir `mfaRequired`), tratada igual.
     *
     * @param profile Perfil de demonstração escolhido pelo cliente.
     * @returns O usuário autenticado, ou `mfaRequired`+`mfaToken` se o
     *   segundo fator ainda precisa ser verificado.
     */
    demoLogin: async (profile: DemoProfile): Promise<LoginResult> => {
        const { data } = await api.post<ApiEnvelope<LoginResponse>>("/auth/demo-login", {
            profile,
            channel: "WEB",
        })

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
     *
     * @param input Token de MFA (da primeira etapa do login) + código.
     * @returns O usuário autenticado.
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
     *
     * @returns O secret TOTP e o QR code de setup.
     */
    mfaSetup: async (): Promise<MfaSetupResponse> => {
        const { data } = await api.post<ApiEnvelope<MfaSetupResponse>>("/auth/mfa/setup")
        return data.data
    },

    /**
     * Confirma o código gerado a partir do secret recebido em mfaSetup e
     * ativa o MFA na conta. Retorna os 10 códigos de backup em texto
     * plano — única vez que ficam visíveis, nunca mais recuperáveis depois
     * (persistidos como hash).
     *
     * @param input Código TOTP gerado a partir do secret de mfaSetup.
     * @returns Os 10 códigos de backup em texto plano.
     */
    mfaVerifySetup: async (input: MfaVerifySetupInput): Promise<MfaVerifySetupResponse> => {
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
     *
     * @param input Senha atual + código TOTP/backup.
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
     *
     * @returns O usuário autenticado, ou `null` se não houver sessão.
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
     * Renova a sessão WEB via refresh token httpOnly. Implementação vive em
     * api.ts (dedup de chamadas concorrentes) — ver comentário lá sobre por
     * que não pode ser o inverso.
     */
    refresh: ensureFreshSession,

    /**
     * Cria uma nova conta. Retorna o User criado.
     * O backend valida exaustivamente — em caso de erro propaga 422
     * (validação) ou 409 (email duplicado).
     *
     * NOTA: este método NÃO faz login. O auto-login é responsabilidade
     * do AuthContext.register, que orquestra register + login.
     *
     * @param input Dados de cadastro (pessoa física ou jurídica).
     * @returns O usuário criado.
     */
    register: async (input: RegisterInput): Promise<User> => {
        const { data } = await api.post<ApiEnvelope<User>>("/users", input)
        return data.data
    },

    /**
     * Solicita o link de redefinição de senha. O backend SEMPRE responde
     * 200 (mesma mensagem genérica), exista ou não o e-mail — proteção
     * contra enumeração de contas. Por isso não há um "e-mail não
     * encontrado" a tratar aqui: sucesso é o único caminho desta chamada.
     *
     * @param email E-mail da conta.
     */
    forgotPassword: async (email: string): Promise<void> => {
        await api.post("/auth/forgot-password", { email })
    },

    /**
     * Efetiva a nova senha a partir do token recebido por e-mail (link
     * gerado em backend/src/modules/auth/email.service.ts, válido por
     * 1h). Propaga erro (400) se o token for inválido, expirado ou já
     * usado — extractErrorMessage entrega a mensagem do backend pronta
     * pra exibir.
     *
     * @param token Token de redefinição recebido por e-mail.
     * @param newPassword Nova senha escolhida pelo usuário.
     */
    resetPassword: async (token: string, newPassword: string): Promise<void> => {
        await api.post("/auth/reset-password", { token, newPassword })
    },

    /**
     * Efetiva a troca de e-mail pedida via PUT /users/:id, a partir do
     * token recebido no NOVO endereço (link gerado em
     * backend/src/modules/auth/email.service.ts, válido por 1h). Todas as
     * sessões do usuário são revogadas no backend quando isso acontece —
     * inclusive a que estiver fazendo esta chamada, se houver.
     *
     * @param token Token de confirmação recebido no novo e-mail.
     */
    confirmEmailChange: async (token: string): Promise<void> => {
        await api.post("/auth/confirm-email-change", { token })
    },
}
