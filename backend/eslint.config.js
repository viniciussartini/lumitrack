import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
    { ignores: ["dist", "src/generated/prisma", "coverage"] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.ts"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.node,
        },
        rules: {
            // Convenção já usada no projeto: prefixo `_` sinaliza "intencionalmente
            // não usado" (ex.: `_next` em assinaturas de error handler do Express,
            // que exigem 4 parâmetros por posição mesmo sem usar todos).
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            // Travas de qualidade obrigatórias (06-code-quality-standards.md:43).
            // Violações existentes na entrada dessas regras são catalogadas e
            // endereçadas nas Fases 16-18 do roadmap, não silenciadas com
            // eslint-disable (ver .claude/docs/roadmap.md, Fase 12).
            complexity: ["error", 12],
            "max-depth": ["error", 4],
            "max-lines-per-function": [
                "error",
                { max: 60, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // `describe`/`it` de teste legitimamente agrupam vários casos e não
        // refletem complexidade de domínio — o sinal que a trava busca é
        // complexidade de código de produção, não estrutura de suíte.
        files: ["**/*.test.ts"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
    {
        // Violações pré-existentes na entrada da trava, catalogadas em vez de
        // silenciadas (critério de aceite da #160). Cada uma tem endereçamento
        // já previsto no roadmap ou foi reportada como achado novo em #160.
        files: ["src/modules/iot/iot-worker/IoTConnectionManager.ts"],
        rules: {
            // `createConnection` — Q-04/Q-05 do laudo de qualidade, endereçado
            // na Fase 16 (`.claude/docs/roadmap.md`), que já prevê schema Zod
            // por protocolo eliminando este switch monolítico.
            complexity: "off",
            "max-lines-per-function": "off",
        },
    },
    {
        files: ["src/modules/consumption/consumption.service.ts"],
        rules: {
            // `list()` — Q-30 do laudo de qualidade, endereçado na Fase 18.
            "max-lines-per-function": "off",
        },
    },
    {
        files: [
            "src/shared/middlewares/authenticate.ts",
            "src/app.ts",
            "prisma/seed-demo/readings.ts",
            "prisma/seed-demo/topology.ts",
            "scripts/backfill-address-encryption.ts",
        ],
        rules: {
            // Achados novos ao ligar a trava nesta issue (#160), sem item de
            // roadmap prévio — catalogados em vez de reescritos às pressas
            // fora do escopo da issue (`authenticate.ts` é código de
            // autenticação: risco de introduzir regressão de segurança sem o
            // cuidado de uma issue dedicada). Rastreado em #168.
            complexity: "off",
            "max-lines-per-function": "off",
        },
    },
)
