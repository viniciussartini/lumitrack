/**
 * Estado de carregamento de página inteira — usado enquanto o boot de
 * autenticação roda (`ProtectedRoute`/`PublicRoute`) e como fallback do
 * `Suspense` das rotas lazy (`AppRouter`).
 */
export const LoadingScreen = () => (
    <div className="flex h-screen items-center justify-center">
        <div className="text-muted">Carregando...</div>
    </div>
)
