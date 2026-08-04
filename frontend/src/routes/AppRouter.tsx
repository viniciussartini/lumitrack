import { Navigate, Route, Routes } from "react-router"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import { PublicRoute } from "@/routes/PublicRoute"
import { LoginPage } from "@/pages/auth/LoginPage"
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage"
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { AppShell } from "@/components/layout/AppShell"
import { RegisterPage } from "@/pages/auth/RegisterPage"
import { DistribuidorsPage } from "@/pages/distributor/DistributorsPage"
import { PropertiesPage } from "@/pages/property/PropertiesPage"
import { PropertyDetailsPage } from "@/pages/property/PropertyDetailsPage"
import { AreaDetailsPage } from "@/pages/area/AreaDetailsPage"
import { DeviceDetailsPage } from "@/pages/device/DeviceDetailsPage"
import { AlertsPage } from "@/pages/alert/AlertsPage"
import { ReportsPage } from "@/pages/report/ReportsPage"
import { SimulationPage } from "@/pages/simulation/SimulationPage"
import { PrivacyPolicyPage } from "@/pages/legal/PrivacyPolicyPage"
import { TermsOfUsePage } from "@/pages/legal/TermsOfUsePage"
import { SecurityPage } from "@/pages/settings/SecurityPage"
import { ProfilePage } from "@/pages/profile/ProfilePage"

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
        {/* Rota raiz — sem Landing page ainda (Fase 5 do roadmap); redireciona
            para /login explicitamente em vez de depender do catch-all. */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Documentos legais — acessíveis independente do estado de autenticação
            (precisam ser lidos antes do cadastro, e por usuários já logados). */}
        <Route path="/privacidade" element={<PrivacyPolicyPage />} />
        <Route path="/termos" element={<TermsOfUsePage />} />

        {/* Rotas públicas — bloqueia acesso de quem já está logado */}
        <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
            {/* Caminho em inglês, fixo — mesmo path que
                backend/src/modules/auth/email.service.ts já embute no link
                enviado por e-mail (?token=...). */}
            <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        {/* Rotas privadas — exige autenticação */}
        <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                
                <Route path="/distribuidoras" element={<DistribuidorsPage />} />

                {/* Criar/editar Propriedade/Área/Dispositivo acontece via modal
                    (PropertyFormDialog/AreaFormDialog/DeviceFormDialog), não
                    mais em rota dedicada — ver sub-issue #97 do épico #104. */}
                <Route path="/propriedades" element={<PropertiesPage />} />
                <Route path="/propriedades/:id" element={<PropertyDetailsPage />} />

                {/* Áreas — rota aninhada espelha o padrão da API (/api/properties/:propertyId/areas/:areaId). */}
                <Route path="/propriedades/:propertyId/areas/:areaId" element={<AreaDetailsPage />} />

                {/*Dispositivos — rota aninhada em DOIS níveis. */}
                <Route path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId" element={<DeviceDetailsPage />} />

                {/* Alertas — inbox global. */}
                <Route path="/alertas" element={<AlertsPage />} />

                {/* Relatórios — seletor cascata de alvo (propriedade → área → dispositivo)
                    + 4 granularidades (hora/dia/mês/ano). */}
                <Route path="/relatorios" element={<ReportsPage />} />

                {/* Simulação — placeholder (Fase 5). */}
                <Route path="/simulacao" element={<SimulationPage />} />

                {/* Conta do usuário logado — acessível via UserMenu no Header. */}
                <Route path="/perfil" element={<ProfilePage />} />
                <Route path="/seguranca" element={<SecurityPage />} />

            </Route>
        </Route>

        {/* Fallback — qualquer URL desconhecida vai para login.
            Quando o user já estiver autenticado, o PublicRoute o redireciona
            para /dashboard automaticamente. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
)