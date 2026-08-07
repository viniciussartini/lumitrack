import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default tseslint.config(
    { ignores: ["dist"] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
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
        },
    },
    {
        files: ["**/*.test.{ts,tsx}"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
    {
        // Débito pré-existente descoberto ao ligar a trava nesta issue
        // (#160), mesma classe do achado catalogado no frontend principal —
        // ver eslint.config.js de frontend/. Rastreado em #168.
        files: ["src/components/network/NetworkCard.tsx", "src/pages/Dashboard.tsx"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
)
