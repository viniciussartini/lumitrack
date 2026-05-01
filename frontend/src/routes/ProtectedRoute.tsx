import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"

/**
 * Guarda de rota: redireciona para /login se o user não estiver autenticado.
 * Enquanto o boot está rodando, mostra um loading mínimo — sem isso, o user
 * que recarrega a página vê /login piscar antes de hidratar a sessão.
 *
 * Uso (em AppRouter):
 *    <Route element={<ProtectedRoute />}>
 *      <Route element={<AppShell />}>
 *        <Route path="/dashboard" element={<DashboardPage />} />
 *        ...outras rotas privadas
 *      </Route>
 *    </Route>
 *
 * NOTA: Esta guarda NÃO renderiza o AppShell — fica responsável apenas
 * pela autenticação. O AppShell é uma rota-mãe separada para permitir
 * rotas autenticadas SEM layout no futuro (ex: tela de boas-vindas).
 */
export const ProtectedRoute = () => {
    const { isAuthenticated, isLoading } = useAuth()
    const location = useLocation()

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-slate-500 dark:text-slate-400">
                    Carregando...
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: location }} />
    }

    return <Outlet />
}