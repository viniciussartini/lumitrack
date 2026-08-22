/**
 * Regressão: a Política de Privacidade não pode afirmar duas coisas
 * incompatíveis sobre onde a infraestrutura é hospedada — a seção 5 chegou a
 * dizer "exclusivamente no Brasil" três parágrafos depois da seção 4
 * descrever corretamente Render+Neon (EUA).
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const policyPath = path.resolve(import.meta.dirname, "./privacy-policy.md")
const policy = readFileSync(policyPath, "utf-8")

describe("privacy-policy.md — consistência sobre local de hospedagem", () => {
    it("não afirma hospedagem exclusiva no Brasil", () => {
        expect(policy).not.toMatch(/exclusivamente no Brasil/i)
    })

    it("mantém a descrição correta da seção 4 (infraestrutura fora do Brasil)", () => {
        expect(policy).toMatch(/fica \*\*fora do Brasil\*\*/)
    })
})
