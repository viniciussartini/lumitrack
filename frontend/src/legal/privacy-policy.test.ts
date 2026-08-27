/**
 * Regressão: a Política de Privacidade não pode afirmar duas coisas
 * incompatíveis sobre a infraestrutura. Esta classe de defeito já apareceu
 * duas vezes, em formas diferentes:
 *
 * 1. Antes de existirem dois ambientes distintos, havia um único ambiente
 *    público (Render+Neon, EUA) e a seção 5 dizia "exclusivamente no
 *    Brasil" três parágrafos depois de a seção 4 descrever corretamente a
 *    infraestrutura fora do país.
 * 2. Ao separar os dois ambientes, a seção 4 passou a dizer que a produção
 *    não tem "operador terceiro" nenhum — contradizendo
 *    a seção 5 ("provedores de nuvem"), a ADR-0012 (que reconhece o provedor
 *    de infraestrutura como agente externo) e o Art. 5º, VII da LGPD, pelo
 *    qual quem armazena dado por conta do controlador É operador.
 *
 * Os testes abaixo travam as duas: o documento precisa distinguir os
 * ambientes, nunca afirmar "Brasil"/"sem transferência" sem qualificar qual,
 * e nunca negar a existência de operador na produção — a conclusão correta e
 * defensável é que o operador existe e processa em território nacional.
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

    it("distingue produção (Brasil) de staging (Render+Neon, EUA)", () => {
        expect(policy).toMatch(/\*\*Produção\*\*[\s\S]*Brasil/i)
        expect(policy).toMatch(
            /\*\*Staging\/valida[cç][aã]o\*\*[\s\S]*Render[\s\S]*Neon[\s\S]*Unidos/i,
        )
    })

    it("não nega a existência de operador na produção — o provedor de infraestrutura é um (Art. 5º, VII)", () => {
        // Armazenar dado por conta do controlador é tratamento (Art. 5º, X) e
        // quem o faz é operador. Afirmar "sem operador" contradiz a ADR-0012 e
        // a seção 5 do próprio documento; a redação correta reconhece o
        // provedor e diz onde ele processa.
        expect(policy).not.toMatch(/sem (nenhum )?operador/i)
        expect(policy).toMatch(/provedor de infraestrutura/i)
    })

    it("nomeia o ambiente de staging, para quem estiver nele se reconhecer", () => {
        expect(policy).toMatch(/onrender\.com/i)
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
