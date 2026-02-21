import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
    test: {
        globals: true,          // describe, it, expect disponíveis sem import
        environment: "node",
        coverage: {
        provider: "v8",
        reporter: ["text", "lcov", "html"],
        exclude: ["node_modules", "dist", "prisma"],
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