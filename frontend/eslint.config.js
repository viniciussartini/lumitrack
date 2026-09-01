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
        // Extraído em CreatedAlertsSection/AlertHistorySection — a
        // complexidade de todo o arquivo já caiu dentro do teto global (o
        // maior dos três é 11), só `max-lines-per-function` segue acima por
        // causa do JSX de orquestração (cabeçalho + KPIs + as duas seções +
        // o dialog). Teto acima do valor medido; revisitar se crescer.
        files: ["src/pages/alert/AlertsPage.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 80, skipBlankLines: true, skipComments: true },
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
        // Componente principal (169 linhas) — extraído em subcomponentes
        // (AccountTypeToggle/IndividualFields/CompanyFields/
        // AcceptedTermsField); a complexidade já caiu dentro do teto global
        // (9), só `max-lines-per-function` segue acima por causa do JSX de
        // orquestração (form + os 3 campos comuns + o botão de submit) que
        // não fazia sentido fatiar mais fino sem perder legibilidade. Teto
        // acima do valor medido; revisitar se crescer.
        files: ["src/pages/auth/RegisterPage.tsx"],
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 180, skipBlankLines: true, skipComments: true },
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
        // Anti-regressão de tokens (10-design-system.md § "Tokens são
        // contrato") — a dívida de valor arbitrário dobrou de 143 para 291
        // para 372 ocorrências em 3 semanas sem nenhuma trava. Barra
        // string literal (ou trecho estático de template literal) com
        // sintaxe de valor arbitrário do Tailwind (`text-[13px]`,
        // `p-[18px]`...) ou hex de 3/6 dígitos fora de
        // `src/styles/industry.css` (que não é `.ts`/`.tsx`, então já fica
        // de fora do escopo do arquivo). Não cobre `.css`: os tokens em si
        // (definição) vivem lá — a regra é sobre *consumo*, não definição.
        files: ["src/**/*.{ts,tsx}"],
        ignores: ["**/*.test.{ts,tsx}"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "Literal[value=/\\[\\d+(\\.\\d+)?(px|rem|em|%)\\]/], TemplateElement[value.raw=/\\[\\d+(\\.\\d+)?(px|rem|em|%)\\]/]",
                    message:
                        "Valor arbitrário do Tailwind sem token equivalente. Se o valor já existe na escala (industry.css), use a classe nomeada; se não existe, é uma decisão de token nova — não driblar inline (10-design-system.md).",
                },
                {
                    selector:
                        "Literal[value=/#([0-9a-fA-F]{3}){1,2}\\b/], TemplateElement[value.raw=/#([0-9a-fA-F]{3}){1,2}\\b/]",
                    message:
                        "Cor hexadecimal hardcoded. Use um token de cor existente (industry.css) ou promova a um novo — não driblar inline (10-design-system.md).",
                },
            ],
        },
    },
    // Débito catalogado ao ligar a trava (Fase 18, item 7) — 34 arquivos com
    // valor arbitrário sem token equivalente na escala atual (majoritariamente
    // espaçamento fora da grade de --spacing, ver CHANGELOG "resto agrupado")
    // e 15 com hex sem token correspondente. Catalogado por arquivo: o grupo
    // abaixo tem as duas dívidas ao mesmo tempo, por isso desliga a regra
    // inteira; os dois grupos seguintes têm só uma das duas e desligam
    // apenas o seletor correspondente, preservando o outro ativo. Mesmo
    // padrão já usado para complexidade/JSDoc — sem exceção, nenhum arquivo
    // fora desta lista pode introduzir a dívida. Revisar ao decidir uma 2ª
    // leva de tokens de espaçamento/cor.
    {
        files: [
            "src/components/auth/RecoverySteps.tsx",
            "src/components/consumption/ComparisonBars.tsx",
            "src/components/layout/Sidebar.tsx",
            "src/components/layout/UserMenu.tsx",
            "src/components/ui/LumiTrackWordmark.tsx",
            "src/pages/auth/LoginPage.tsx",
            "src/pages/auth/RegisterPage.tsx",
            "src/pages/landing/LandingPage.tsx",
        ],
        rules: { "no-restricted-syntax": "off" },
    },
    {
        files: [
            "src/components/alert/AlertEventTable.tsx",
            "src/components/alert/AlertTable.tsx",
            "src/components/area/AreaCard.tsx",
            "src/components/consumption/ConsumptionSection.tsx",
            "src/components/dashboard/ConsumptionHistorySection.tsx",
            "src/components/dashboard/PropertyComparisonSection.tsx",
            "src/components/dashboard/PropertySelector.tsx",
            "src/components/device/DeviceCard.tsx",
            "src/components/layout/Header.tsx",
            "src/components/meter/MeterSection.tsx",
            "src/components/property/PropertyCard.tsx",
            "src/components/ui/FormDialog.tsx",
            "src/components/ui/IconCircle.tsx",
            "src/components/ui/Input.tsx",
            "src/components/ui/PasswordRequirements.tsx",
            "src/pages/alert/AlertsPage.tsx",
            "src/pages/area/AreaDetailsPage.tsx",
            "src/pages/auth/ConfirmEmailChangePage.tsx",
            "src/pages/auth/ForgotPasswordPage.tsx",
            "src/pages/auth/ResetPasswordPage.tsx",
            "src/pages/device/DeviceDetailsPage.tsx",
            "src/pages/distributor/DistributorsPage.tsx",
            "src/pages/legal/LegalDocumentPage.tsx",
            "src/pages/profile/ProfilePage.tsx",
            "src/pages/property/PropertiesPage.tsx",
            "src/pages/property/PropertyDetailsPage.tsx",
        ],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "Literal[value=/#([0-9a-fA-F]{3}){1,2}\\b/], TemplateElement[value.raw=/#([0-9a-fA-F]{3}){1,2}\\b/]",
                    message:
                        "Cor hexadecimal hardcoded. Use um token de cor existente (industry.css) ou promova a um novo — não driblar inline (10-design-system.md).",
                },
            ],
        },
    },
    {
        files: ["src/components/auth/BrandPanel.tsx"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "Literal[value=/\\[\\d+(\\.\\d+)?(px|rem|em|%)\\]/], TemplateElement[value.raw=/\\[\\d+(\\.\\d+)?(px|rem|em|%)\\]/]",
                    message:
                        "Valor arbitrário do Tailwind sem token equivalente. Se o valor já existe na escala (industry.css), use a classe nomeada; se não existe, é uma decisão de token nova — não driblar inline (10-design-system.md).",
                },
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
