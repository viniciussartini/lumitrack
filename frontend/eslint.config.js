import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import jsdoc from "eslint-plugin-jsdoc"

export default tseslint.config(
    { ignores: ["dist", "playwright-report", "test-results"] },
    {
        // `recommendedTypeChecked` completo custa mais do que rende para um
        // MVP solo (mesma decisão do backend) — fallback: só as 2 regras
        // tipadas de maior valor aqui.
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
        // `describe`/`it` de teste legitimamente agrupam vários casos e não
        // refletem complexidade de domínio — o sinal que a trava busca é
        // complexidade de código de produção, não estrutura de suíte.
        files: ["**/*.test.{ts,tsx}", "tests/e2e/**/*.spec.ts"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
    // Débito pré-existente descoberto ao ligar a trava — não havia
    // catalogação prévia de complexidade de componente React (só backend).
    // Medido de novo em 2026-08-28 (o levantamento original catalogava 48
    // arquivos; 6 já passam nos dois limites hoje e saíram da lista —
    // RealtimeSection.tsx, PropertyCard.tsx, ConfirmDialog.tsx,
    // RealtimeContext.tsx, ThemeContext.tsx e AboutPage.tsx). Cada bloco
    // abaixo agrupa arquivos com o mesmo teto medido — acima do valor real,
    // abaixo do que equivaleria a desligar a regra. Revisar na Fase 18
    // (roadmap.md, polimento).
    {
        files: [
            "src/components/consumption/ConsumptionSection.tsx",
            "src/components/meter/MeterForm.tsx",
            "src/pages/report/ReportsPage.tsx",
        ],
        rules: {
            complexity: ["error", 20],
            "max-lines-per-function": [
                "error",
                { max: 110, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/dashboard/ConsumptionHistorySection.tsx"],
        rules: {
            complexity: ["error", 25],
            "max-lines-per-function": [
                "error",
                { max: 80, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/dashboard/DashboardKpiRow.tsx"],
        rules: {
            complexity: ["error", 30],
            "max-lines-per-function": [
                "error",
                { max: 90, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/meter/MeterFormDialog.tsx"],
        rules: {
            complexity: ["error", 15],
            "max-lines-per-function": [
                "error",
                { max: 70, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/meter/MeterSection.tsx"],
        rules: {
            complexity: ["error", 25],
            "max-lines-per-function": [
                "error",
                { max: 180, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/property/PropertyForm.tsx"],
        rules: {
            complexity: ["error", 30],
            "max-lines-per-function": [
                "error",
                { max: 190, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/property/PropertyFormDialog.tsx"],
        rules: {
            complexity: ["error", 15],
            "max-lines-per-function": [
                "error",
                { max: 110, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/ui/Input.tsx", "src/pages/property/PropertiesPage.tsx"],
        rules: {
            complexity: ["error", 20],
            "max-lines-per-function": [
                "error",
                { max: 90, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/alert/AlertsPage.tsx"],
        rules: {
            complexity: ["error", 40],
            "max-lines-per-function": [
                "error",
                { max: 170, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/area/AreaDetailsPage.tsx"],
        rules: {
            complexity: ["error", 15],
            "max-lines-per-function": [
                "error",
                { max: 140, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/auth/LoginPage.tsx"],
        rules: {
            complexity: ["error", 15],
            "max-lines-per-function": [
                "error",
                { max: 230, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/auth/RegisterPage.tsx"],
        rules: {
            complexity: ["error", 25],
            "max-lines-per-function": [
                "error",
                { max: 320, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/distributor/DistributorsPage.tsx"],
        rules: {
            complexity: ["error", 25],
            "max-lines-per-function": [
                "error",
                { max: 100, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/property/PropertyDetailsPage.tsx"],
        rules: {
            complexity: ["error", 15],
            "max-lines-per-function": [
                "error",
                { max: 150, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/settings/SecurityPage.tsx"],
        rules: {
            complexity: ["error", 15],
            "max-lines-per-function": [
                "error",
                { max: 160, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    // Só complexidade acima do teto — linhas por função já dentro do limite.
    {
        files: ["src/lib/userDisplay.ts", "src/pages/dashboard/DashboardPage.tsx"],
        rules: {
            complexity: ["error", 20],
        },
    },
    // Só linhas por função acima do teto — complexidade já dentro do limite.
    {
        files: [
            "src/components/area/AreaForm.tsx",
            "src/components/device/DeviceForm.tsx",
            "src/components/distributor/DistributorCard.tsx",
        ],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 90, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: [
            "src/components/alert/AlertForm.tsx",
            "src/components/area/AreaMenu.tsx",
            "src/components/property/PropertyMenu.tsx",
            "src/pages/auth/ForgotPasswordPage.tsx",
            "src/pages/profile/ProfilePage.tsx",
        ],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 120, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/alert/AlertRowMenu.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 210, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: [
            "src/components/auth/BrandPanel.tsx",
            "src/components/auth/MfaCodeForm.tsx",
            "src/components/consumption/ConsumptionChart.tsx",
        ],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 80, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: [
            "src/components/dashboard/PropertyComparisonSection.tsx",
            "src/components/device/DeviceFormDialog.tsx",
            "src/components/layout/Sidebar.tsx",
        ],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 70, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/device/DeviceMenu.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 130, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/layout/NotificationDropdown.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 140, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/components/layout/UserMenu.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 150, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/contexts/AuthContext.tsx", "src/pages/device/DeviceDetailsPage.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 110, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/auth/ResetPasswordPage.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 160, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: ["src/pages/landing/LandingPage.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 100, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // JSDoc real em exports públicos da camada de service
        // (06-code-quality-standards.md) — equivalente frontend de
        // service/repository/controller do backend. Débito medido e
        // corrigido junto: os `*.service.ts` só tinham tags @param/@returns
        // faltando em blocos já existentes; api.ts tinha 2 exports
        // (ensureFreshSession, extractErrorMessage) sem bloco. `*.ts` (não
        // só `*.service.ts`) cobre os dois.
        files: ["src/services/*.ts"],
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
                        "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ObjectExpression > Property",
                    ],
                },
            ],
            "jsdoc/require-param": "error",
            "jsdoc/require-returns": "error",
        },
    },
)
