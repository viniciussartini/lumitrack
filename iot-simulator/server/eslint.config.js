import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import jsdoc from "eslint-plugin-jsdoc"

export default tseslint.config(
    { ignores: ["dist", "coverage"] },
    {
        // `recommendedTypeChecked` completo custa mais do que rende para um
        // MVP solo (mesmo achado do backend em #162) — fallback que a
        // própria issue previu: só as 2 regras tipadas de maior valor aqui.
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.ts"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.node,
            parserOptions: {
                // vitest.config.ts não está incluído no tsconfig.json (não é
                // código de app) — sem isto, as 2 regras tipadas abaixo
                // derrubam o parser nesse arquivo.
                projectService: { allowDefaultProject: ["vitest.config.ts"] },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
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
        // refletem complexidade de domínio.
        files: ["**/*.test.ts"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
    {
        // JSDoc real em exports públicos da camada de simulação/broker/MQTT
        // (06-code-quality-standards.md) — equivalente da camada de service
        // neste pacote (sem convenção service/repository/controller). Medido
        // antes de ligar: débito pequeno, corrigido junto — zero débito
        // para catalogar.
        files: ["src/simulation/*.ts", "src/broker/*.ts", "src/mqtt/*.ts"],
        ignores: ["**/*.test.ts"],
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
