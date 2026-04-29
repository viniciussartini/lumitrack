import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import App from "./App.tsx"
import "./index.css"

/**
 * Configuração global do TanStack Query.
 * staleTime de 30s evita refetches em cascata quando o user navega
 * entre páginas que dependem dos mesmos dados.
 * retry: 1 — uma única tentativa extra em caso de falha de rede.
 */

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
})

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
            {/* Devtools só renderiza em desenvolvimento — Vite faz tree-shake em produção */}
            {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
    </StrictMode>,
)