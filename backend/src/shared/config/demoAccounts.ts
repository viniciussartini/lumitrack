// Fonte única dos e-mails das contas de demonstração — usada pelo seed
// (backend/prisma/seed-demo.ts) e pelo guard de proteção de senha em
// AuthService.forgotPassword (Fase 4 do épico de simulador/seed demo).
export const DEMO_RESIDENTIAL_EMAIL = "demo.residencial@lumitrack.dev"
export const DEMO_COMMERCIAL_EMAIL = "demo.comercial@lumitrack.dev"

export const DEMO_ACCOUNT_EMAILS: ReadonlySet<string> = new Set([
    DEMO_RESIDENTIAL_EMAIL,
    DEMO_COMMERCIAL_EMAIL,
])
