import { Navigate, Outlet } from "react-router"
import { useAuth } from "@/contexts/AuthContext"

export const PublicRoute = () => {
    const { isAuthenticated, isLoading } = useAuth()

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-slate-500 dark:text-slate-400">Carregando...</div>
            </div>
        )
    }

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />
    }

    return <Outlet />
}
