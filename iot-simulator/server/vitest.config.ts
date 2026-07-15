import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        env: {
            NODE_ENV: "test",
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
