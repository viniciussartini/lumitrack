/**
 * Regressão: a Política de Privacidade não pode afirmar duas coisas
 * incompatíveis sobre onde a infraestrutura é hospedada. Até a Fase 13.7
 * havia um único ambiente público (Render+Neon, EUA) — a seção 5 chegou a
 * dizer "exclusivamente no Brasil" três parágrafos depois da seção 4
 * descrever corretamente a infraestrutura fora do Brasil. Desde a Fase
 * 13.7 existem DOIS ambientes (produção na VPS, Brasil; staging no
 * Render+Neon, EUA) — o documento precisa distinguir os dois, nunca
 * afirmar "Brasil" (ou "sem transferência") sem qualificar qual ambiente,
 * senão reintroduz a mesma classe de contradição.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const policyPath = path.resolve(import.meta.dirname, "./privacy-policy.md")
const policy = readFileSync(policyPath, "utf-8")

describe("privacy-policy.md — consistência sobre local de hospedagem", () => {
    it("não afirma hospedagem exclusiva no Brasil sem qualificar o ambiente", () => {
        expect(policy).not.toMatch(/exclusivamente no Brasil/i)
    })

    it("distingue produção (Brasil, sem operador) de staging (Render+Neon, EUA)", () => {
        expect(policy).toMatch(/\*\*Produção\*\*[\s\S]*Brasil[\s\S]*sem operador/i)
        expect(policy).toMatch(
            /\*\*Staging\/valida[cç][aã]o\*\*[\s\S]*Render[\s\S]*Neon[\s\S]*Unidos/i,
        )
    })

    it("toda afirmação de 'não há transferência internacional' fica no parágrafo da produção, não é uma afirmação geral do documento", () => {
        const noTransferSentences =
            policy.match(/[^.]*não há transferência internacional[^.]*\./gi) ?? []
        expect(noTransferSentences.length).toBeGreaterThan(0)
        for (const sentence of noTransferSentences) {
            expect(sentence).toMatch(/[Pp]rodução/)
        }
    })
})
