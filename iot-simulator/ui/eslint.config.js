import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import jsdoc from "eslint-plugin-jsdoc"

export default tseslint.config(
    { ignores: ["dist"] },
    {
        // `recommendedTypeChecked` completo custa mais do que rende para um
        // MVP solo (mesmo achado do backend em #162) — fallback que a
        // própria issue previu: só as 2 regras tipadas de maior valor aqui.
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
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
        files: ["**/*.test.{ts,tsx}"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
    {
        // Débito pré-existente descoberto ao ligar a trava, mesma classe do
        // achado catalogado no frontend principal — ver eslint.config.js de
        // frontend/. Medido em 2026-08-28 (184 e 180 linhas); complexidade
        // já está dentro do limite global nos dois. Revisar na Fase 18
        // (roadmap.md, polimento).
        files: ["src/components/network/NetworkCard.tsx", "src/pages/Dashboard.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 190, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // JSDoc real em exports públicos de services/hooks
        // (06-code-quality-standards.md) — equivalente da camada de service
        // neste pacote (só componentes de UI e alguns hooks/services, sem
        // convenção service/repository/controller). Medido antes de ligar:
        // débito pequeno, corrigido junto — zero débito para catalogar.
        files: ["src/services/*.ts", "src/hooks/*.ts"],
        ignores: ["**/*.test.ts"],
        plugins: { jsdoc },
        rules: {
            "jsdoc/require-jsdoc": [
                "error",
                {
                    publicOnly: true,
                    require: { FunctionDeclaration: true },
                    contexts: [
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
