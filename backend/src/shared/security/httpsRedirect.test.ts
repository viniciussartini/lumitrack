import { describe, it, expect } from "vitest"
import { decideHttpsRedirect } from "@/shared/security/httpsRedirect.js"

const base = {
    nodeEnv: "production",
    requestHost: "api.lumitrack.example",
    requestSecure: true,
    originalUrl: "/api/users",
    canonicalHost: "api.lumitrack.example",
    canonicalOrigin: "https://api.lumitrack.example",
}

describe("decideHttpsRedirect", () => {
    it("segue adiante (next) fora de produção, mesmo com Host diferente do canônico", () => {
        const decision = decideHttpsRedirect({
            ...base,
            nodeEnv: "development",
            requestHost: "qualquer-coisa.invalid",
        })

        expect(decision).toEqual({ action: "next" })
    })

    it("segue adiante quando o Host bate com o canônico e a requisição já é HTTPS", () => {
        const decision = decideHttpsRedirect(base)

        expect(decision).toEqual({ action: "next" })
    })

    it("recusa (reject) quando o Host não bate com o canônico — nunca redireciona com ele", () => {
        const decision = decideHttpsRedirect({ ...base, requestHost: "evil.example" })

        expect(decision).toEqual({ action: "reject" })
    })

    it("recusa quando o Host está ausente", () => {
        const decision = decideHttpsRedirect({ ...base, requestHost: undefined })

        expect(decision).toEqual({ action: "reject" })
    })

    it("redireciona para HTTPS usando o host canônico, nunca o header do cliente", () => {
        const decision = decideHttpsRedirect({ ...base, requestSecure: false })

        expect(decision).toEqual({
            action: "redirect",
            location: "https://api.lumitrack.example/api/users",
        })
    })

    it("o destino do redirect nunca reflete um Host forjado (open redirect)", () => {
        // Mesmo que, por algum bug futuro, alguém tentasse montar o location
        // a partir do request — aqui a única fonte é canonicalOrigin.
        const decision = decideHttpsRedirect({
            ...base,
            requestHost: "api.lumitrack.example",
            requestSecure: false,
            originalUrl: "/painel?x=1",
        })

        expect(decision).toEqual({
            action: "redirect",
            location: "https://api.lumitrack.example/painel?x=1",
        })
    })
})
