import { Navigate, Outlet } from "react-router"
import { useAuth } from "@/contexts/AuthContext"
import { LoadingScreen } from "@/components/ui/LoadingScreen"

export const PublicRoute = () => {
    const { isAuthenticated, isLoading } = useAuth()

    if (isLoading) {
        return <LoadingScreen />
    }

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />
    }

    return <Outlet />
}
