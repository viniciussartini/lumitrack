import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import App from "./App.tsx"
import "./index.css"

// O QueryClient/QueryClientProvider vive só em App.tsx (lib/queryClient.ts é
// a instância documentada) — este arquivo chegou a montar um segundo
// provider com config própria, mas o provider interno (App.tsx) sempre
// vence via contexto React, então aquela config nunca surtia efeito de
// verdade (código morto, achado M-11 do laudo de desempenho) e o
// ReactQueryDevtools renderizava duas vezes em dev. Ver App.tsx.
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>,
)
