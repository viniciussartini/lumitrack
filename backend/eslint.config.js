import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
    { ignores: ["dist", "src/generated/prisma", "coverage"] },
    {
        // `recommendedTypeChecked` completo (333 achados só no backend, em
        // sua maioria `no-unsafe-*` sobre resposta de supertest/axios em
        // teste) custa mais do que rende para um MVP solo — fallback que a
        // própria issue #162 previu: só as 2 regras tipadas de maior valor
        // aqui (handlers Express assíncronos, listeners de worker,
        // schedulers, o padrão `void alertEvaluator.evaluate(...)`).
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.ts"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.node,
            parserOptions: {
                // `tsconfig.json` só cobre `src/**/*` (rootDir do build) —
                // `vitest.config.ts` e os ~17 scripts de `prisma/`/`scripts/`
                // (rodados ad hoc via tsx, nunca fizeram parte de nenhum
                // projeto TS "de verdade") ficam de fora. Sem isto, as 2
                // regras tipadas abaixo derrubam o parser nesses arquivos.
                projectService: {
                    allowDefaultProject: [
                        "vitest.config.ts",
                        "prisma.config.ts",
                        "prisma/*.ts",
                        "prisma/seed-demo/*.ts",
                        "scripts/*.ts",
                    ],
                    // Acima do padrão (8) porque o match real é ~17 arquivos
                    // de tooling/seed — nenhum é código de app quente.
                    maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 25,
                },
                tsconfigRootDir: import.meta.dirname,
            },
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
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
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
