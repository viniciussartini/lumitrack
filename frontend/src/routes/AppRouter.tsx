import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import { PublicRoute } from "@/routes/PublicRoute"
import { AppShell } from "@/components/layout/AppShell"
import { LoadingScreen } from "@/components/ui/LoadingScreen"
import { RouteLoadErrorBoundary } from "@/components/ui/RouteLoadErrorBoundary"

// Lazy — cada página vira seu próprio chunk, baixado só quando a rota é
// visitada. `/login` (a primeira tela de quem ainda não tem sessão) não
// precisa carregar `recharts`/`react-markdown` inteiros, usados só nas
// páginas de gráfico e nas de documento legal/institucional.
const LandingPage = lazy(() =>
    import("@/pages/landing/LandingPage").then((m) => ({ default: m.LandingPage })),
)
const LoginPage = lazy(() =>
    import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
)
const ForgotPasswordPage = lazy(() =>
    import("@/pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() =>
    import("@/pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
)
const ConfirmEmailChangePage = lazy(() =>
    import("@/pages/auth/ConfirmEmailChangePage").then((m) => ({
        default: m.ConfirmEmailChangePage,
    })),
)
const DashboardPage = lazy(() =>
    import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
)
const RegisterPage = lazy(() =>
    import("@/pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })),
)
const DistribuidorsPage = lazy(() =>
    import("@/pages/distributor/DistributorsPage").then((m) => ({ default: m.DistribuidorsPage })),
)
const PropertiesPage = lazy(() =>
    import("@/pages/property/PropertiesPage").then((m) => ({ default: m.PropertiesPage })),
)
const PropertyDetailsPage = lazy(() =>
    import("@/pages/property/PropertyDetailsPage").then((m) => ({
        default: m.PropertyDetailsPage,
    })),
)
const AreaDetailsPage = lazy(() =>
    import("@/pages/area/AreaDetailsPage").then((m) => ({ default: m.AreaDetailsPage })),
)
const DeviceDetailsPage = lazy(() =>
    import("@/pages/device/DeviceDetailsPage").then((m) => ({ default: m.DeviceDetailsPage })),
)
const AlertsPage = lazy(() =>
    import("@/pages/alert/AlertsPage").then((m) => ({ default: m.AlertsPage })),
)
const ReportsPage = lazy(() =>
    import("@/pages/report/ReportsPage").then((m) => ({ default: m.ReportsPage })),
)
const SimulationPage = lazy(() =>
    import("@/pages/simulation/SimulationPage").then((m) => ({ default: m.SimulationPage })),
)
const PrivacyPolicyPage = lazy(() =>
    import("@/pages/legal/PrivacyPolicyPage").then((m) => ({ default: m.PrivacyPolicyPage })),
)
const TermsOfUsePage = lazy(() =>
    import("@/pages/legal/TermsOfUsePage").then((m) => ({ default: m.TermsOfUsePage })),
)
const SecurityPage = lazy(() =>
    import("@/pages/settings/SecurityPage").then((m) => ({ default: m.SecurityPage })),
)
const ProfilePage = lazy(() =>
    import("@/pages/profile/ProfilePage").then((m) => ({ default: m.ProfilePage })),
)
const AboutPage = lazy(() =>
    import("@/pages/about/AboutPage").then((m) => ({ default: m.AboutPage })),
)

/**
 * Mapa de rotas
 *
 * PublicRoute    → só para deslogados (login, registro, reset senha)
 * ProtectedRoute → só para logados (todo o resto da app)
 *
 * @returns
 */

const AppRoutes = () => (
    <Routes>
        {/* Documentos legais — acessíveis independente do estado de autenticação
                (precisam ser lidos antes do cadastro, e por usuários já logados). */}
        <Route path="/privacidade" element={<PrivacyPolicyPage />} />
        <Route path="/termos" element={<TermsOfUsePage />} />

        {/* Confirmação de troca de e-mail — standalone de propósito, fora
                de PublicRoute: um usuário já autenticado
                também precisa conseguir confirmar (PublicRoute o mandaria
                direto pra /dashboard antes de a chamada acontecer). */}
        <Route path="/confirmar-email" element={<ConfirmEmailChangePage />} />

        {/* Rotas públicas — bloqueia acesso de quem já está logado. A raiz
                entra aqui: usuário já autenticado que acessa "/" cai em
                /dashboard pela mesma regra que já vale para /login e /registro,
                sem duplicar a checagem de PublicRoute. */}
        <Route element={<PublicRoute />}>
            <Route path="/" element={<LandingPage />} />
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
                        em rota dedicada. */}
                <Route path="/propriedades" element={<PropertiesPage />} />
                <Route path="/propriedades/:id" element={<PropertyDetailsPage />} />

                {/* Áreas — rota aninhada espelha o padrão da API (/api/properties/:propertyId/areas/:areaId). */}
                <Route
                    path="/propriedades/:propertyId/areas/:areaId"
                    element={<AreaDetailsPage />}
                />

                {/*Dispositivos — rota aninhada em DOIS níveis. */}
                <Route
                    path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId"
                    element={<DeviceDetailsPage />}
                />

                {/* Alertas — inbox global. */}
                <Route path="/alertas" element={<AlertsPage />} />

                {/* Relatórios — seletor cascata de alvo (propriedade → área → dispositivo)
                        + 4 granularidades (hora/dia/mês/ano). */}
                <Route path="/relatorios" element={<ReportsPage />} />

                {/* Simulação — placeholder. */}
                <Route path="/simulacao" element={<SimulationPage />} />

                {/* Conta do usuário logado — acessível via UserMenu no Header. */}
                <Route path="/perfil" element={<ProfilePage />} />
                <Route path="/seguranca" element={<SecurityPage />} />

                {/* Institucional — sem RF, versão provisória sem handoff. */}
                <Route path="/sobre" element={<AboutPage />} />
            </Route>
        </Route>

        {/* Fallback — qualquer URL desconhecida vai para login.
                Quando o user já estiver autenticado, o PublicRoute o redireciona
                para /dashboard automaticamente. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
)

export const AppRouter = () => (
    <RouteLoadErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
            <AppRoutes />
        </Suspense>
    </RouteLoadErrorBoundary>
)
