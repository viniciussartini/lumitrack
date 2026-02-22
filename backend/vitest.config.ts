import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
    test: {
        globals: true,          // describe, it, expect disponíveis sem import
        environment: "node",
        env: {
            NODE_ENV: "test",   // Garante que o código saiba que está em ambiente de teste
        },

        maxWorkers: 1,           // Força testes a rodarem em série para evitar conflitos no banco de dados compartilhado. O cleanDatabase() apaga tudo antes de cada teste, mas se rodarem em paralelo, podem interferir um no outro.

        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "html"],
            exclude: ["node_modules", "dist", "prisma", "src/shared/test"],
        },
    },
    resolve: {
        alias: {
            // Espelha os paths do tsconfig para que o Vitest
            // também resolva @/ corretamente durante os testes.
            "@": resolve(__dirname, "src"),
        },
    },
})