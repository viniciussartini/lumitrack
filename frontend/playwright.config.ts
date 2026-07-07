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
        { name: "firefox",  use: { ...devices["Desktop Firefox"] } },
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
        command: process.env.CI
            ? "npm run build && npm run preview -- --port 5173 --strictPort"
            : "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 120_000 : 60_000,
    },
})