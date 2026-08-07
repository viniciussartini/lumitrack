import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { authService } from "@/services/auth.service"
import { extractErrorMessage } from "@/services/api"
import { authState } from "@/lib/authState"
import { scheduleProactiveRefresh, cancelProactiveRefresh } from "@/lib/sessionRefresh"
import type {
    LoginInput,
    LoginResult,
    MfaLoginVerifyInput,
    User,
    RegisterInput,
} from "@/types/auth.types"
import { useNavigate } from "react-router"

interface AuthContextValue {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    /**
     * Retorna o LoginResult para o caller decidir o que fazer quando
     * `mfaRequired:true` (mostrar o segundo passo) — só atualiza o estado
     * de sessão quando o login já está completo (sem MFA, ou seja).
     */
    login: (input: LoginInput) => Promise<LoginResult>
    /** Segundo passo do login quando a conta tem MFA habilitado. */
    completeMfaLogin: (input: MfaLoginVerifyInput) => Promise<void>
    logout: () => Promise<void>
    register: (input: RegisterInput) => Promise<void>
    /** Rebusca o usuário via /auth/me — usado após setup/disable de MFA. */
    refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

interface AuthProviderProps {
    children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const navigate = useNavigate()

    // Mantém `authState` (módulo em memória consultado pelo interceptor de
    // 401 em api.ts) sincronizado com o estado real de autenticação.
    const updateUser = (newUser: User | null): void => {
        authState.setHasSession(newUser !== null)
        setUser(newUser)
    }

    useEffect(() => {
        const bootstrap = async () => {
            const currentUser = await authService.getCurrentUser()
            updateUser(currentUser)
            if (currentUser) scheduleProactiveRefresh()
            setIsLoading(false)
        }
        void bootstrap()
        return () => {
            cancelProactiveRefresh()
        }
    }, [])

    useEffect(() => {
        const handleUnauthorized = () => {
            cancelProactiveRefresh()
            updateUser(null)
            void navigate("/login", { replace: true })
        }
        window.addEventListener("lumitrack:unauthorized", handleUnauthorized)
        return () => {
            window.removeEventListener("lumitrack:unauthorized", handleUnauthorized)
        }
    }, [navigate])

    const login = async (input: LoginInput): Promise<LoginResult> => {
        try {
            const result = await authService.login(input)
            if (!result.mfaRequired) {
                updateUser(result.user)
                scheduleProactiveRefresh()
            }
            return result
        } catch (error) {
            throw new Error(extractErrorMessage(error), { cause: error })
        }
    }

    const completeMfaLogin = async (input: MfaLoginVerifyInput): Promise<void> => {
        try {
            const fullUser = await authService.verifyMfaLogin(input)
            updateUser(fullUser)
            scheduleProactiveRefresh()
        } catch (error) {
            throw new Error(extractErrorMessage(error), { cause: error })
        }
    }

    const logout = async (): Promise<void> => {
        cancelProactiveRefresh()
        await authService.logout()
        updateUser(null)
    }

    const register = async (input: RegisterInput): Promise<void> => {
        try {
            await authService.register(input)
        } catch (error) {
            throw new Error(extractErrorMessage(error), { cause: error })
        }

        try {
            // Uma conta recém-criada nunca tem MFA habilitado (o setup exige
            // estar autenticado), mas tratamos mfaRequired defensivamente
            // como falha do auto-login em vez de assumir a forma da resposta.
            const result = await authService.login({
                email: input.email,
                password: input.password,
            })
            if (result.mfaRequired) {
                throw new Error("POST_REGISTER_LOGIN_FAILED")
            }
            updateUser(result.user)
        } catch {
            throw new Error("POST_REGISTER_LOGIN_FAILED")
        }
    }

    const refreshUser = async (): Promise<void> => {
        const fullUser = await authService.getCurrentUser()
        updateUser(fullUser)
    }

    const value: AuthContextValue = {
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        completeMfaLogin,
        logout,
        register,
        refreshUser,
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext)

    if (context === undefined) {
        throw new Error("useAuth deve ser usado dentro de <AuthProvider>")
    }

    return context
}
