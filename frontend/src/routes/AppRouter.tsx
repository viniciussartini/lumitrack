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
import { NewAreaPage } from "@/pages/area/NewAreaPage"
import { AreaDetailsPage } from "@/pages/area/AreaDetailsPage"
import { EditAreaPage } from "@/pages/area/EditAreaPage"
import { NewDevicePage } from "@/pages/device/NewDevicePage"
import { DeviceDetailsPage } from "@/pages/device/DeviceDetailsPage"
import { EditDevicePage } from "@/pages/device/EditDevicePage"
import { AlertsPage } from "@/pages/alert/AlertsPage"
import { PropertyReportPage } from "@/pages/report/PropertyReportPage"
import { AreaReportPage } from "@/pages/report/AreaReportPage"
import { DeviceReportPage } from "@/pages/report/DeviceReportPage"
import { PrivacyPolicyPage } from "@/pages/legal/PrivacyPolicyPage"
import { TermsOfUsePage } from "@/pages/legal/TermsOfUsePage"

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
                <Route path="/distribuidoras/nova" element={<NewDistributorPage />} />
                <Route path="/distribuidoras/:id/editar" element={<EditDistributorPage />} />

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

                {/* Alertas — inbox global. Filtros via query string (?triggered=true|false). */}
                <Route path="/alertas" element={<AlertsPage />} />

                {/* Relatórios — uma rota dedicada por nível (Property/Area/Device).
                    Query string sincronizada: ?period=DAILY|MONTHLY|ANNUAL&dateFrom=...&dateTo=... */}
                <Route path="/propriedades/:id/relatorio" element={<PropertyReportPage />} />
                <Route path="/propriedades/:propertyId/areas/:areaId/relatorio" element={<AreaReportPage />} />
                <Route path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId/relatorio" element={<DeviceReportPage />} />

            </Route>
        </Route>

        {/* Fallback — qualquer URL desconhecida vai para login.
            Quando o user já estiver autenticado, o PublicRoute o redireciona
            para /dashboard automaticamente. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
)