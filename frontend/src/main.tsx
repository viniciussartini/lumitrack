import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import App from "./App.tsx"
import "./index.css"

// O QueryClient/QueryClientProvider vive só em App.tsx (lib/queryClient.ts é
// a instância documentada) — montar um segundo provider aqui com config
// própria seria código morto, porque o provider interno (App.tsx) sempre
// vence via contexto React, e faria o ReactQueryDevtools renderizar duas
// vezes em dev. Ver App.tsx.
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>,
)
