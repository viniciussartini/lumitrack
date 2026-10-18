import { Toaster } from "sonner"
import { AuthProvider } from "./contexts/AuthContext"
import { ThemeProvider, useTheme } from "./contexts/ThemeContext"
import { AppRouter } from "./routes/AppRouter"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/queryClient"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

const ThemedToaster = () => {
    const { resolvedTheme } = useTheme()

    // Embaixo, e não no canto superior direito: é de lá que abrem o menu do
    // usuário, o sino e o menu ⋯ das páginas. Com a pilha de toasts expandida
    // (ponteiro sobre ela) os toasts cobriam o menu, e o sonner só os descarta
    // quando o ponteiro sai de cima deles.
    return <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
}

const App = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <AuthProvider>
                    <AppRouter />
                </AuthProvider>
                <ThemedToaster />
            </ThemeProvider>

            {import.meta.env.DEV && (
                <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
            )}
        </QueryClientProvider>
    )
}

export default App
