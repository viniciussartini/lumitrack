import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5180,
        proxy: {
            // Encaminha chamadas para o servidor do simulador em dev sem CORS
            // (mesmo padrão do frontend principal, que faz proxy pro backend).
            "/api": {
                target: "http://localhost:4100",
                changeOrigin: true,
            },
        },
    },
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: "./src/tests/setup.ts",
        css: true,
        exclude: ["**/node_modules/**"],
    },
})
