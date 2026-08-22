import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { CURRENT_CONSENT_VERSION } from "./consentVersion.js"

// A versão que o titular lê no cabeçalho do documento precisa ser
// exatamente a que o backend grava em User.consentVersion no aceite —
// senão o titular aceita um texto e o sistema registra outro (Art. 7º/8º).
// As duas fontes já divergiram por descuido (bump de uma sem a outra) —
// este teste amarra as duas para a divergência não passar despercebida.
const privacyPolicyPath = path.resolve(
    import.meta.dirname,
    "../../../../frontend/src/legal/privacy-policy.md",
)
const privacyPolicy = readFileSync(privacyPolicyPath, "utf-8")

describe("CURRENT_CONSENT_VERSION", () => {
    it("bate com a versão declarada no cabeçalho de privacy-policy.md", () => {
        const match = privacyPolicy.match(/^\*\*Versão (\S+) —/m)
        expect(match, "cabeçalho '**Versão X —' não encontrado em privacy-policy.md").not.toBeNull()
        expect(match![1]).toBe(CURRENT_CONSENT_VERSION)
    })
})
