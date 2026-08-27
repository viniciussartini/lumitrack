import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        env: {
            NODE_ENV: "test",
            // Não são segredos — só satisfazem a validação obrigatória de
            // env.ts para os testes rodarem sem precisar de um .env local.
            // Testes que exercitam o schema em si (env.test.ts) passam seus
            // próprios valores via safeParse() diretamente.
            SIMULATOR_API_TOKEN: "token-de-teste-com-mais-de-16-chars",
            BROKER_USERNAME: "sim-user-teste",
            BROKER_PASSWORD: "sim-pass-teste",
        },
        passWithNoTests: true,
        exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "html"],
            exclude: ["node_modules", "dist"],
        },
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
})
