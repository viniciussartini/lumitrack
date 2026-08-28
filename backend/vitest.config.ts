import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
    test: {
        globals: true, // describe, it, expect disponíveis sem import
        environment: "node",
        env: {
            NODE_ENV: "test", // Garante que o código saiba que está em ambiente de teste

            // Allowlist SSRF (shared/security/outboundHost.ts) só para os
            // hostnames fictícios já usados como fixture nos testes de medidor
            // (meter.service.test.ts/meter.routes.test.ts) — sem isso, o
            // deny-by-default de loopback/RFC1918 quebraria esses testes, que não
            // são sobre SSRF. Os cenários que testam a recusa em si usam hosts
            // fora desta lista de propósito.
            IOT_ALLOWED_HOSTS: "localhost,novo-host,h,127.0.0.1/32,::1/128",
        },

        maxWorkers: 1, // Força testes a rodarem em série para evitar conflitos no banco de dados compartilhado. O cleanDatabase() apaga tudo antes de cada teste, mas se rodarem em paralelo, podem interferir um no outro.

        // O default do Vitest 4.x só exclui node_modules/.git — sem isto,
        // um dist/ local (de `npm run build`, ou de `tsc -b` rodado sem
        // --noEmit) faz o vitest também rodar os .test.js compilados,
        // duplicando cada teste silenciosamente. Mesma guarda já usada em
        // iot-simulator/server/vitest.config.ts.
        exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**"],

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
