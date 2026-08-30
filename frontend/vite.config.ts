import { defineConfig } from "vitest/config"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { visualizer } from "rollup-plugin-visualizer"
import path from "node:path"

// index.html usa %VITE_CSP_CONNECT_EXTRA% no connect-src do CSP (ver
// comentário no próprio arquivo). Vite só substitui %VAR% quando a
// variável está definida — mesmo vazia; sem isso aqui, um build sem essa
// variável (dev, self-hosted) deixaria o placeholder literal no CSP
// gerado. Só a demo do Render (render.yaml) define um valor de verdade.
process.env.VITE_CSP_CONNECT_EXTRA ??= ""

export default defineConfig({
    plugins: [
        react(),
        babel({
            presets: [reactCompilerPreset()],
        }),
        tailwindcss(),
        // `ANALYZE=true npm run build` gera dist/stats.html (treemap +
        // tamanho gzip por módulo); não roda em todo build.
        process.env.ANALYZE === "true" &&
            visualizer({
                filename: "dist/stats.html",
                gzipSize: true,
                brotliSize: true,
                template: "treemap",
            }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5173,
        proxy: {
            // Encaminha chamadas para o backend em dev sem CORS
            "/api": {
                target: "http://localhost:3333",
                changeOrigin: true,
            },
        },
    },
    // `vite preview` não herda `server.proxy` — precisa da própria config.
    // Usado pelo job `e2e` do CI (ver playwright.config.ts), que roda os
    // testes contra um build de produção em vez de `vite dev`.
    preview: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:3333",
                changeOrigin: true,
            },
        },
    },
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: "./src/tests/setup.ts",
        css: true,
        // Fixo pra todo o processo de teste, ANTES de qualquer módulo ser
        // importado — mutar `process.env.TZ` dentro de um arquivo de teste
        // roda tarde demais (hoisting de import) e vaza pros arquivos
        // seguintes no mesmo worker. Sem isso, testes que dependem de um
        // fuso com offset não-zero (decodificação de datas vindas do
        // backend vs. instantes locais) passariam de fato só por acaso,
        // dependendo de qual arquivo o worker carrega primeiro.
        env: { TZ: "America/Sao_Paulo" },
        exclude: ["**/node_modules/**", "**/tests/e2e/**"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            exclude: ["node_modules/", "src/tests/", "**/*.config.*", "**/tests/e2e/**"],
        },
    },
})
