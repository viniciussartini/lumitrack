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
    {
        // Débito pré-existente descoberto ao ligar a trava — não havia
        // catalogação prévia de complexidade de componente React (só
        // backend), então não há fase do roadmap que já cubra isto.
        // Catalogado explicitamente aqui (não eslint-disable disperso), em
        // vez de reescrever ~46 arquivos fora do escopo deste enforcement.
        files: [
            "src/components/alert/AlertForm.tsx",
            "src/components/alert/AlertRowMenu.tsx",
            "src/components/area/AreaForm.tsx",
            "src/components/area/AreaMenu.tsx",
            "src/components/auth/BrandPanel.tsx",
            "src/components/auth/MfaCodeForm.tsx",
            "src/components/consumption/ConsumptionChart.tsx",
            "src/components/consumption/ConsumptionSection.tsx",
            "src/components/dashboard/ConsumptionHistorySection.tsx",
            "src/components/dashboard/DashboardKpiRow.tsx",
            "src/components/dashboard/PropertyComparisonSection.tsx",
            "src/components/dashboard/RealtimeSection.tsx",
            "src/components/device/DeviceFormDialog.tsx",
            "src/components/device/DeviceForm.tsx",
            "src/components/device/DeviceMenu.tsx",
            "src/components/distributor/DistributorCard.tsx",
            "src/components/layout/NotificationDropdown.tsx",
            "src/components/layout/Sidebar.tsx",
            "src/components/layout/UserMenu.tsx",
            "src/components/meter/MeterFormDialog.tsx",
            "src/components/meter/MeterForm.tsx",
            "src/components/meter/MeterSection.tsx",
            "src/components/property/PropertyCard.tsx",
            "src/components/property/PropertyFormDialog.tsx",
            "src/components/property/PropertyForm.tsx",
            "src/components/property/PropertyMenu.tsx",
            "src/components/ui/ConfirmDialog.tsx",
            "src/components/ui/Input.tsx",
            "src/contexts/AuthContext.tsx",
            "src/contexts/RealtimeContext.tsx",
            "src/contexts/ThemeContext.tsx",
            "src/lib/userDisplay.ts",
            "src/pages/about/AboutPage.tsx",
            "src/pages/alert/AlertsPage.tsx",
            "src/pages/area/AreaDetailsPage.tsx",
            "src/pages/auth/ForgotPasswordPage.tsx",
            "src/pages/auth/LoginPage.tsx",
            "src/pages/auth/RegisterPage.tsx",
            "src/pages/auth/ResetPasswordPage.tsx",
            "src/pages/dashboard/DashboardPage.tsx",
            "src/pages/device/DeviceDetailsPage.tsx",
            "src/pages/distributor/DistributorsPage.tsx",
            "src/pages/landing/LandingPage.tsx",
            "src/pages/profile/ProfilePage.tsx",
            "src/pages/property/PropertiesPage.tsx",
            "src/pages/property/PropertyDetailsPage.tsx",
            "src/pages/report/ReportsPage.tsx",
            "src/pages/settings/SecurityPage.tsx",
        ],
        rules: {
            complexity: "off",
            "max-lines-per-function": "off",
        },
    },
    {
        // JSDoc real em exports públicos da camada de service
        // (06-code-quality-standards.md) — equivalente frontend de
        // service/repository/controller do backend. Medido antes de ligar:
        // zero débito (os services já documentavam bem; só faltavam tags
        // @param/@returns em blocos já existentes, corrigido junto).
        files: ["src/services/*.service.ts"],
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
