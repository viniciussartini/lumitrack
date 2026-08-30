import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { z } from "zod"
import App from "./App.tsx"
import "./index.css"

// Zod v4 sonda `Function("")` uma única vez por processo pra decidir se usa
// o caminho JIT de validação de objeto — sonda que o CSP deste app (sem
// `unsafe-eval`) bloqueia. Com os schemas agora em chunk assíncrono (code-
// splitting por rota), essa sonda passa a rodar no meio do carregamento de
// página em vez de na inicialização, e alguns browsers promovem a exceção
// engolida pela sonda a uma violação de CSP visível. `jitless: true` desliga
// a sonda — é a saída documentada pelo próprio Zod para CSPs estritas, sem
// precisar afrouxar a política. Precisa rodar aqui, no entrypoint, antes de
// qualquer schema ser importado (mesmo que só via chunk lazy mais tarde).
z.config({ jitless: true })

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
