import { describe, expect, it } from "vitest"
import { CURRENT_CONSENT_VERSION } from "./consentVersion.js"

describe("CURRENT_CONSENT_VERSION", () => {
    it("está na versão 1.3, publicada junto da correção da seção 5 da Política de Privacidade", () => {
        expect(CURRENT_CONSENT_VERSION).toBe("1.3")
    })
})
