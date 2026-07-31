import { Navigate, Route, Routes } from "react-router"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import { PublicRoute } from "@/routes/PublicRoute"
import { LoginPage } from "@/pages/auth/LoginPage"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { AppShell } from "@/components/layout/AppShell"
import { RegisterPage } from "@/pages/auth/RegisterPage"
import { DistribuidorsPage } from "@/pages/distributor/DistributorsPage"
import { PropertiesPage } from "@/pages/property/PropertiesPage"
import { NewPropertyPage } from "@/pages/property/NewPropertyPage"
import { PropertyDetailsPage } from "@/pages/property/PropertyDetailsPage"
import { EditPropertyPage } from "@/pages/property/EditPropertyPage"
import { NewAreaPage } from "@/pages/area/NewAreaPage"
import { AreaDetailsPage } from "@/pages/area/AreaDetailsPage"
import { EditAreaPage } from "@/pages/area/EditAreaPage"
import { NewDevicePage } from "@/pages/device/NewDevicePage"
import { DeviceDetailsPage } from "@/pages/device/DeviceDetailsPage"
import { EditDevicePage } from "@/pages/device/EditDevicePage"
import { AlertsPage } from "@/pages/alert/AlertsPage"
import { ReportsPage } from "@/pages/report/ReportsPage"
import { SimulationPage } from "@/pages/simulation/SimulationPage"
import { PrivacyPolicyPage } from "@/pages/legal/PrivacyPolicyPage"
import { TermsOfUsePage } from "@/pages/legal/TermsOfUsePage"
import { SecurityPage } from "@/pages/settings/SecurityPage"

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
        {/* Documentos legais — acessíveis independente do estado de autenticação
            (precisam ser lidos antes do cadastro, e por usuários já logados). */}
        <Route path="/privacidade" element={<PrivacyPolicyPage />} />
        <Route path="/termos" element={<TermsOfUsePage />} />

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

                <Route path="/propriedades" element={<PropertiesPage />} />
                <Route path="/propriedades/nova" element={<NewPropertyPage />} />
                <Route path="/propriedades/:id" element={<PropertyDetailsPage />} />
                <Route path="/propriedades/:id/editar" element={<EditPropertyPage />} />

                {/* Áreas — rota aninhada espelha o padrão da API (/api/properties/:propertyId/areas/:areaId). */}
                <Route path="/propriedades/:propertyId/areas/nova" element={<NewAreaPage />} />
                <Route path="/propriedades/:propertyId/areas/:areaId" element={<AreaDetailsPage />} />
                <Route path="/propriedades/:propertyId/areas/:areaId/editar" element={<EditAreaPage />} />

                {/*Dispositivos — rota aninhada em DOIS níveis. */}
                <Route path="/propriedades/:propertyId/areas/:areaId/devices/novo" element={<NewDevicePage />} />
                <Route path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId" element={<DeviceDetailsPage />} />
                <Route path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId/editar" element={<EditDevicePage />} />

                {/* Alertas — inbox global. */}
                <Route path="/alertas" element={<AlertsPage />} />

                {/* Relatórios — seletor cascata de alvo (propriedade → área → dispositivo)
                    + 4 granularidades (hora/dia/mês/ano). */}
                <Route path="/relatorios" element={<ReportsPage />} />

                {/* Simulação — placeholder (Fase 5). */}
                <Route path="/simulacao" element={<SimulationPage />} />

                {/* Conta do usuário logado — acessível via UserMenu no Header. */}
                <Route path="/seguranca" element={<SecurityPage />} />

            </Route>
        </Route>

        {/* Fallback — qualquer URL desconhecida vai para login.
            Quando o user já estiver autenticado, o PublicRoute o redireciona
            para /dashboard automaticamente. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
)