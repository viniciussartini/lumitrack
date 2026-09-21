import { lazy, Suspense, type ReactNode } from "react"
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
const AnalysisLayout = lazy(() =>
    import("@/pages/analysis/AnalysisLayout").then((m) => ({ default: m.AnalysisLayout })),
)
const AnalysisEmptyState = lazy(() =>
    import("@/pages/analysis/AnalysisEmptyState").then((m) => ({
        default: m.AnalysisEmptyState,
    })),
)
const PropertyDetailsPage = lazy(() =>
    import("@/pages/property/PropertyDetailsPage").then((m) => ({
        default: m.PropertyDetailsPage,
    })),
)
const AclComparisonPage = lazy(() =>
    import("@/pages/property/AclComparisonPage").then((m) => ({
        default: m.AclComparisonPage,
    })),
)
const BrancaComparisonPage = lazy(() =>
    import("@/pages/property/BrancaComparisonPage").then((m) => ({
        default: m.BrancaComparisonPage,
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
const SettingsLayout = lazy(() =>
    import("@/pages/settings/SettingsLayout").then((m) => ({ default: m.SettingsLayout })),
)
const RegistrationPage = lazy(() =>
    import("@/pages/settings/RegistrationPage").then((m) => ({ default: m.RegistrationPage })),
)

interface AppRouteConfig {
    path: string
    element: ReactNode
}

// Rotas dentro de ProtectedRoute + AppShell — o grupo que cresce a cada
// fase do roadmap (1 entrada por página nova). Extraído da árvore JSX pra
// `.map()` de propósito: sem isso, `AppRoutes` empurra o teto de
// max-lines-per-function do lint a cada rota adicionada (override por
// arquivo teria que subir de novo), porque cada `<Route>` com path longo
// quebra em várias linhas pelo printWidth do Prettier.
const APP_SHELL_ROUTES: AppRouteConfig[] = [
    { path: "/dashboard", element: <DashboardPage /> },
    { path: "/distribuidoras", element: <DistribuidorsPage /> },

    // Comparações de tarifa — páginas inteiras, sem a árvore de Análise.
    { path: "/propriedades/:id/comparacao-acl", element: <AclComparisonPage /> },
    { path: "/propriedades/:id/comparacao-branca", element: <BrancaComparisonPage /> },

    // Alertas — inbox global.
    { path: "/alertas", element: <AlertsPage /> },

    // Relatórios — seletor cascata de alvo (propriedade → área → dispositivo)
    // + 4 granularidades (hora/dia/mês/ano).
    { path: "/relatorios", element: <ReportsPage /> },

    // Conta do usuário logado — acessível via UserMenu no Header.
    { path: "/perfil", element: <ProfilePage /> },
    { path: "/seguranca", element: <SecurityPage /> },

    // Institucional — sem RF, versão provisória sem handoff.
    { path: "/sobre", element: <AboutPage /> },
]

// Análise — árvore de seleção à esquerda e o detalhe do item à direita. A
// rota filha espelha o padrão da API
// (/api/properties/:propertyId/areas/:areaId/devices/:deviceId): cada nível da
// hierarquia tem a sua. Criar/excluir vivem em Configurações → Cadastro;
// editar é por modal (PropertyFormDialog/AreaFormDialog/DeviceFormDialog).
const ANALYSIS_ROUTES = (
    <Route path="/propriedades" element={<AnalysisLayout />}>
        <Route index element={<AnalysisEmptyState />} />
        <Route path=":id" element={<PropertyDetailsPage />} />
        <Route path=":propertyId/areas/:areaId" element={<AreaDetailsPage />} />
        <Route path=":propertyId/areas/:areaId/devices/:deviceId" element={<DeviceDetailsPage />} />
    </Route>
)

// Configurações — layout com sub-navegação lateral e uma rota filha por
// sub-página. Fora do `.map()` acima porque, como Análise, é rota aninhada.
const SETTINGS_ROUTES = (
    <Route path="/configuracoes" element={<SettingsLayout />}>
        <Route index element={<Navigate to="cadastro" replace />} />
        <Route path="cadastro" element={<RegistrationPage />} />
    </Route>
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
                {APP_SHELL_ROUTES.map(({ path, element }) => (
                    <Route key={path} path={path} element={element} />
                ))}
                {ANALYSIS_ROUTES}
                {SETTINGS_ROUTES}
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
