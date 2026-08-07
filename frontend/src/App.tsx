import { Toaster } from "sonner"
import { AuthProvider } from "./contexts/AuthContext"
import { ThemeProvider, useTheme } from "./contexts/ThemeContext"
import { AppRouter } from "./routes/AppRouter"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/queryClient"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

const ThemedToaster = () => {
    const { resolvedTheme } = useTheme()

    return <Toaster position="top-right" richColors closeButton theme={resolvedTheme} />
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
