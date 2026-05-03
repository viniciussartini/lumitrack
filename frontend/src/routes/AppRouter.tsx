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
import { PropertiesPage } from "@/pages/property/PropertiesPage"
import { NewPropertyPage } from "@/pages/property/NewPropertyPage"
import { PropertyDetailsPage } from "@/pages/property/PropertyDetailsPage"
import { EditPropertyPage } from "@/pages/property/EditPropertyPage"

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

                <Route path="/propriedades" element={<PropertiesPage />} />
                <Route path="/propriedades/nova" element={<NewPropertyPage />} />
                <Route path="/propriedades/:id" element={<PropertyDetailsPage />} />
                <Route path="/propriedades/:id/editar" element={<EditPropertyPage />} />

            </Route>
        </Route>

        {/* Fallback — qualquer URL desconhecida vai para login.
            Quando o user já estiver autenticado, o PublicRoute o redireciona
            para /dashboard automaticamente. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
)