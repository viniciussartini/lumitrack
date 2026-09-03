import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import jsdoc from "eslint-plugin-jsdoc"

export default tseslint.config(
    { ignores: ["dist", "src/generated/prisma", "coverage"] },
    {
        // `recommendedTypeChecked` completo (333 achados só no backend, em
        // sua maioria `no-unsafe-*` sobre resposta de supertest/axios em
        // teste) custa mais do que rende para um MVP solo — fallback: só as
        // 2 regras tipadas de maior valor aqui (handlers Express assíncronos,
        // listeners de worker, schedulers, o padrão
        // `void alertEvaluator.evaluate(...)`).
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
            // Mecaniza a proibição de comentário de rastreabilidade
            // (06-code-quality-standards.md) — issue/PR/laudo/achado de
            // revisão pertencem ao git, aos ADRs, ao CHANGELOG e às issues,
            // nunca ao código-fonte. Termos de auditoria são específicos
            // ("laudo de auditoria" etc.), não a palavra solta — ela também
            // nomeia a feature de trilha de auditoria (audit trail) do
            // sistema, uso legítimo que a regra não deve barrar.
            "no-warning-comments": [
                "error",
                {
                    terms: [
                        "issue #",
                        "closes #",
                        "fixes #",
                        "pr #",
                        "laudo de auditoria",
                        "achado de auditoria",
                        "relatório de auditoria",
                        "achado",
                        "conforme revisão",
                        "solicitado na revisão",
                        "ver issue",
                        "ref #",
                    ],
                    location: "anywhere",
                },
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
        // `createConnection` — mesmo depois do schema Zod por protocolo o
        // switch por protocolo ainda passa do teto global. Teto acima do
        // valor medido (complexidade 19, 99 linhas), abaixo do que
        // equivaleria a desligar a regra — revisar na Fase 18 (roadmap.md,
        // polimento) se o arquivo crescer.
        files: ["src/modules/iot/iot-worker/IoTConnectionManager.ts"],
        rules: {
            complexity: ["error", 20],
            "max-lines-per-function": [
                "error",
                { max: 110, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // `summary()` (82 linhas) — `list()` saiu desta exceção depois de
        // `computeYearlyPropertyCosts`/`resolveBucketCost` serem extraídos
        // pra métodos próprios, agora dentro do teto global sem override.
        // `summary()` não foi tocado por aquela extração — já tem seu
        // próprio equivalente em `calculateYearlyPropertyCost`, um método à
        // parte — e seu tamanho vem de orquestrar autorização em lote
        // (resolver posse de cada id, montar os mapas de medidor/bucket),
        // não de lógica de custo repetida. Teto acima do valor medido;
        // revisitar se o arquivo crescer.
        files: ["src/modules/consumption/consumption.service.ts"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 90, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // Código de autenticação — teto (não extração) por cautela: mudar a
        // estrutura deste arquivo exige o cuidado dedicado de uma mudança
        // própria, não um efeito colateral de configuração. Teto acima do
        // valor medido (complexidade 17, 66 linhas) — revisar na Fase 18.
        files: ["src/shared/middlewares/authenticate.ts"],
        rules: {
            complexity: ["error", 20],
            "max-lines-per-function": [
                "error",
                { max: 70, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // Ponto de composição único do app — teto acima do valor medido
        // (complexidade 14, 129 linhas). Revisar na Fase 18 se justificar
        // quebrar o ponto de composição.
        files: ["src/app.ts"],
        rules: {
            complexity: ["error", 15],
            "max-lines-per-function": [
                "error",
                { max: 140, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // Teto acima do valor medido (61 linhas, 1 acima do teto global);
        // complexidade já está dentro do limite. Revisar na Fase 18.
        files: ["prisma/seed-demo/topology.ts"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 70, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // `main` — teto acima do valor medido (complexidade 14); linhas por
        // função já estão dentro do limite global. Revisar na Fase 18.
        files: ["scripts/backfill-address-encryption.ts"],
        rules: {
            complexity: ["error", 15],
        },
    },
    {
        // JSDoc real em exports públicos de service/repository/controller
        // (06-code-quality-standards.md), sem exceções.
        files: [
            "src/modules/*/*.service.ts",
            "src/modules/*/*.repository.ts",
            "src/modules/*/*.controller.ts",
        ],
        plugins: { jsdoc },
        rules: {
            "jsdoc/require-jsdoc": [
                "error",
                {
                    publicOnly: true,
                    require: {
                        ClassDeclaration: true,
                        MethodDefinition: true,
                        FunctionDeclaration: true,
                    },
                    contexts: [
                        "ExportNamedDeclaration > ClassDeclaration",
                        "ExportNamedDeclaration > FunctionDeclaration",
                        "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
                        "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > FunctionExpression",
                    ],
                },
            ],
            "jsdoc/require-param": "error",
            "jsdoc/require-returns": "error",
        },
    },
)
