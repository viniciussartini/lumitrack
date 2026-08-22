import { randomInt } from "node:crypto"
import { DEMO_COMMERCIAL_EMAIL, DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"

// Sem default fixo — uma senha versionada, mesmo sintética, é exatamente o
// que o gitleaks existe para pegar. `DEMO_SEED_PASSWORD` configura um
// valor fixo (útil para repetir login manualmente entre re-seeds); sem
// ela, gera uma nova a cada execução, impressa só no console do seed
// (verify.ts) — nunca persistida em código.
function randomSeedPassword(): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    const lower = "abcdefghijkmnpqrstuvwxyz"
    const digits = "23456789"
    const special = "!@#$%^&*"
    // randomInt (não randomBytes % length) — sem o viés de módulo que
    // sub-representa os últimos caracteres de cada charset.
    const pick = (charset: string) => charset[randomInt(charset.length)]!
    const filler = Array.from({ length: 8 }, () => pick(upper + lower + digits + special)).join("")
    // Satisfaz passwordSchema (mín. 8, maiúscula, minúscula, número, especial).
    return `${pick(upper)}${pick(lower)}${pick(digits)}${pick(special)}${filler}`
}

export const DEMO_PASSWORD = process.env["DEMO_SEED_PASSWORD"] ?? randomSeedPassword()

export { DEMO_COMMERCIAL_EMAIL, DEMO_RESIDENTIAL_EMAIL }
