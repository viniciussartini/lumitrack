import { Navigate, Route, Routes } from "react-router-dom"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import { PublicRoute } from "@/routes/PublicRoute"
import { LoginPage } from "@/pages/auth/LoginPage"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { AppShell } from "@/components/layout/AppShell"
import { RegisterPage } from "@/pages/auth/RegisterPage"
import { DistribuidorsPage } from "@/pages/distributor/DistributorsPage"
import { NewDistributorPage } from "@/pages/distributor/NewDistributorPage"
import { EditDistributorPage } from "@/pages/distributor/EditDistributorPage"

/**
 * Mapa de rotas
 * 
 * PublicRoute    → só para deslogados (login, registro, reset senha)
 * ProtectedRoute → só para logados (todo o resto da app)
 * 
 * @returns 
 */

export const AppRouter = () => (
    <Routes>
        {/* Rotas públicas — bloqueia acesso de quem já está logado */}
        <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
        </Route>

        {/* Rotas privadas — exige autenticação */}
        <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                
                <Route path="/distribuidoras" element={<DistribuidorsPage />} />
                <Route path="/distribuidoras/nova" element={<NewDistributorPage />} />
                <Route path="/distribuidoras/:id/editar" element={<EditDistributorPage />} />
            </Route>
        </Route>

        {/* Fallback — qualquer URL desconhecida vai para login.
            Quando o user já estiver autenticado, o PublicRoute o redireciona
            para /dashboard automaticamente. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
)