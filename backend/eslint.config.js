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
        // `list()` — endereçado na Fase 18. Teto acima do valor medido
        // (84 linhas); complexidade já está dentro do limite global, sem
        // necessidade de override.
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
        // (06-code-quality-standards.md). Ligado como "error" — vale para
        // todo arquivo novo a partir de agora (um arquivo fora do override
        // abaixo já é pego inteiro). Método novo dentro de um arquivo já
        // catalogado no override continua isento, porque a exceção é por
        // arquivo, não por método — ver #303 para o débito remanescente.
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
    {
        // Débito de JSDoc: 100% dos arquivos do escopo acima usam comentário
        // `//` funcional em vez de JSDoc real nas classes/métodos públicos.
        // Catalogado por arquivo (não um glob genérico) — cada um sai desta
        // lista ao ser documentado; a lista nunca cresce silenciosamente,
        // já que um módulo novo não entra aqui automaticamente. Rastreado
        // em #303.
        files: [
            "src/modules/admin/admin.controller.ts",
            "src/modules/admin/admin.service.ts",
            "src/modules/alert/alert.controller.ts",
            "src/modules/alert/alert.repository.ts",
            "src/modules/alert/alert.service.ts",
            "src/modules/alert/alert-trigger-event.repository.ts",
            "src/modules/alert-event/alert-event.controller.ts",
            "src/modules/alert-event/alert-event.service.ts",
            "src/modules/area/area.controller.ts",
            "src/modules/area/area.repository.ts",
            "src/modules/area/area.service.ts",
            "src/modules/auth/auth.controller.ts",
            "src/modules/auth/auth.repository.ts",
            "src/modules/auth/auth.service.ts",
            "src/modules/auth/email-change.service.ts",
            "src/modules/auth/email.service.ts",
            "src/modules/consumption/consumption.controller.ts",
            "src/modules/consumption/consumption.repository.ts",
            "src/modules/consumption/consumption.service.ts",
            "src/modules/device/device.controller.ts",
            "src/modules/device/device.repository.ts",
            "src/modules/device/device.service.ts",
            "src/modules/distributor/distributor.controller.ts",
            "src/modules/distributor/distributor.repository.ts",
            "src/modules/distributor/distributor.service.ts",
            "src/modules/export/export.controller.ts",
            "src/modules/export/export.service.ts",
            "src/modules/iot/sse-ticket.service.ts",
            "src/modules/meter/meter.controller.ts",
            "src/modules/meter/meter-reading.controller.ts",
            "src/modules/meter/meter-reading.repository.ts",
            "src/modules/meter/meter-reading.service.ts",
            "src/modules/meter/meter.repository.ts",
            "src/modules/meter/meter.service.ts",
            "src/modules/notification/notification.controller.ts",
            "src/modules/notification/notification.service.ts",
            "src/modules/property/property.controller.ts",
            "src/modules/property/property.repository.ts",
            "src/modules/property/property.service.ts",
            "src/modules/simulation/simulation.controller.ts",
            "src/modules/simulation/simulation.service.ts",
            "src/modules/tariff-flag/tariff-flag.controller.ts",
            "src/modules/tariff-flag/tariff-flag-history.repository.ts",
            "src/modules/tariff-flag/tariff-flag.repository.ts",
            "src/modules/tariff-flag/tariff-flag.service.ts",
            "src/modules/user/user.controller.ts",
            "src/modules/user/user.repository.ts",
            "src/modules/user/user.service.ts",
        ],
        rules: {
            "jsdoc/require-jsdoc": "off",
            "jsdoc/require-param": "off",
            "jsdoc/require-returns": "off",
        },
    },
)
