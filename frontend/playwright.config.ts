import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: "html",
    use: {
        baseURL: "http://localhost:5173",
        trace: "on-first-retry",
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    ],
    webServer: {
        // No CI, roda contra um build de produção (`vite preview`) em vez de
        // `vite dev`: elimina o TanStack Query DevTools do bundle (gated por
        // import.meta.env.DEV — o botão flutuante remonta a cada invalidação
        // de query e intercepta pointer events de outros controles, causando
        // cliques/timeouts flakeados) e desativa o double-render/double-effect
        // de diagnóstico do StrictMode (não-op em produção). Bônus: assets
        // pré-buildados servem bem mais rápido que a transformação sob
        // demanda do dev server, reduzindo timing flakiness sob CI com CPU
        // limitada. Local (fora de CI) continua em `vite dev` para manter
        // HMR na iteração manual.
        //
        // `VITE_SSE_URL=` força o caminho same-origin do SSE (o que os specs
        // de tempo real mockam via `page.route("**/api/iot/stream")`),
        // independente do que estiver em `frontend/.env` — sem isso, um
        // `.env` local com `VITE_SSE_URL` absoluto (caminho cross-origin,
        // pensado pra demo fora do Brasil) faz o app tentar um ticket que
        // nunca chega no ambiente do Playwright, e os testes de tempo real
        // ficam presos esperando um evento que nunca chega. Só tem efeito
        // quando o Playwright de fato sobe o servidor — não se reaproveitar
        // um já rodando (`reuseExistingServer`, abaixo). No comando de CI,
        // o prefixo só precisa estar no `build`: a variável é embutida no
        // bundle nesse momento, e `vite preview` depois só serve os arquivos
        // estáticos já gerados — repeti-lo ali não teria efeito nenhum.
        command: process.env.CI
            ? "VITE_SSE_URL= npm run build && npm run preview -- --port 5173 --strictPort"
            : "VITE_SSE_URL= npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 120_000 : 60_000,
    },
})
