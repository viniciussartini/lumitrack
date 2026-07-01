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
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
        },
    },
)
