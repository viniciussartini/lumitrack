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
        files: ["**/*.test.{ts,tsx}", "tests/e2e/**/*.spec.ts"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
    // Débito pré-existente descoberto ao ligar a trava — não havia
    // catalogação prévia de complexidade de componente React (só backend).
    // O levantamento original catalogava 48 arquivos; 6 já passam nos dois
    // limites hoje e saíram da lista — RealtimeSection.tsx, PropertyCard.tsx,
    // ConfirmDialog.tsx, RealtimeContext.tsx, ThemeContext.tsx e
    // AboutPage.tsx. Cada bloco abaixo é 1 arquivo com o teto medido
    // individualmente — acima do valor real, abaixo do que equivaleria a
    // desligar a regra. Revisar na Fase 18 (roadmap.md, polimento).
    {
        // Complexidade 18, 101 linhas.
        files: ["src/components/consumption/ConsumptionSection.tsx"],
        rules: {
            complexity: ["error", 20],
            "max-lines-per-function": [
                "error",
                { max: 110, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // Complexidade 16, 104 linhas.
        files: ["src/components/meter/MeterForm.tsx"],
        rules: {
            complexity: ["error", 20],
            "max-lines-per-function": [
                "error",
                { max: 110, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // Complexidade 16, 102 linhas.
        files: ["src/pages/report/ReportsPage.tsx"],
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
        // Complexidade 17, 83 linhas.
        files: ["src/components/ui/Input.tsx"],
        rules: {
            complexity: ["error", 20],
            "max-lines-per-function": [
                "error",
                { max: 90, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // Complexidade 19, 79 linhas.
        files: ["src/pages/property/PropertiesPage.tsx"],
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
        // Complexidade 15.
        files: ["src/lib/userDisplay.ts"],
        rules: {
            complexity: ["error", 20],
        },
    },
    {
        // Complexidade 16.
        files: ["src/pages/dashboard/DashboardPage.tsx"],
        rules: {
            complexity: ["error", 20],
        },
    },
    // Só linhas por função acima do teto — complexidade já dentro do limite.
    {
        // 80 linhas.
        files: ["src/components/area/AreaForm.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 90, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 84 linhas.
        files: ["src/components/device/DeviceForm.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 90, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 78 linhas.
        files: ["src/components/distributor/DistributorCard.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 90, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 115 linhas.
        files: ["src/components/alert/AlertForm.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 120, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 110 linhas.
        files: ["src/components/area/AreaMenu.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 120, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 110 linhas.
        files: ["src/components/property/PropertyMenu.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 120, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 114 linhas.
        files: ["src/pages/auth/ForgotPasswordPage.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 120, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 106 linhas.
        files: ["src/pages/profile/ProfilePage.tsx"],
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
        // 66 linhas.
        files: ["src/components/auth/BrandPanel.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 80, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 69 linhas.
        files: ["src/components/auth/MfaCodeForm.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 80, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 73 linhas.
        files: ["src/components/consumption/ConsumptionChart.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 80, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 61 linhas.
        files: ["src/components/dashboard/PropertyComparisonSection.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 70, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 63 linhas.
        files: ["src/components/device/DeviceFormDialog.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 70, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 64 linhas.
        files: ["src/components/layout/Sidebar.tsx"],
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
        // 105 linhas.
        files: ["src/contexts/AuthContext.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 110, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        // 104 linhas.
        files: ["src/pages/device/DeviceDetailsPage.tsx"],
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
