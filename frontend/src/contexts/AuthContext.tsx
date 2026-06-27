import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react"
import { authService } from "@/services/auth.service"
import { extractErrorMessage } from "@/services/api"
import { authState } from "@/lib/authState"
import type { LoginInput, User, RegisterInput } from "@/types/auth.types"
import { useNavigate } from "react-router-dom"

interface AuthContextValue {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    login: (input: LoginInput) => Promise<void>
    logout: () => Promise<void>
    register: (input: RegisterInput) => Promise<void>
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
            setIsLoading(false)
        }
        bootstrap()
    }, [])

    useEffect(() => {
        const handleUnauthorized = () => {
            updateUser(null)
            navigate("/login", { replace: true })
        }
        window.addEventListener("lumitrack:unauthorized", handleUnauthorized)
        return () => {
            window.removeEventListener("lumitrack:unauthorized", handleUnauthorized)
        }
    }, [navigate])

    const login = async (input: LoginInput): Promise<void> => {
        try {
            const fullUser = await authService.login(input)
            updateUser(fullUser)
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw new Error(extractErrorMessage(error), { cause: error })
        }
    }

    const logout = async (): Promise<void> => {
        await authService.logout()
        updateUser(null)
    }

    const register = async (input: RegisterInput): Promise<void> => {
        try {
            await authService.register(input)
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw new Error(extractErrorMessage(error), { cause: error })
        }

        try {
            const fullUser = await authService.login({
                email: input.email,
                password: input.password,
            })
            updateUser(fullUser)
        } catch {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw new Error("POST_REGISTER_LOGIN_FAILED")
        }
    }

    const value: AuthContextValue = {
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        logout,
        register,
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