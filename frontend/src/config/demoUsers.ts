// Credenciais fixas dos usuários criados por `backend/prisma/seed-demo/constants.ts`
// — mantidas em sincronia manualmente (não há import cross-projeto entre
// frontend e backend). Usadas só pelos botões de "login de demonstração" da
// LoginPage, atrás da flag `VITE_DEMO_MODE`.
export const DEMO_USERS = {
    residential: {
        email: "demo.residencial@lumitrack.dev",
        password: "DemoLumi@2026",
        label: "Ver demo residencial",
    },
    commercial: {
        email: "demo.comercial@lumitrack.dev",
        password: "DemoLumi@2026",
        label: "Ver demo comercial",
    },
} as const
