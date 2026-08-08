// Issue #184 — os controles de A02 (cabeçalhos de segurança via helmet, CORS
// pinado) já existem em app.ts desde antes desta issue, mas nenhum teste os
// cobria: uma remoção acidental de `helmet(...)` ou uma troca de `CORS_ORIGIN`
// por uma função que reflete a Origin da requisição passaria batido. Este
// arquivo fecha essa lacuna de cobertura pura — não muda nenhum controle.
import { describe, it, expect } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { env } from "@/config/env.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"

const app = createApp({ prismaClient: prismaHttpTest })

describe("Cabeçalhos de segurança (A02)", () => {
    it("aplica Content-Security-Policy negando tudo por padrão, com frame-ancestors 'none'", async () => {
        const res = await request(app).get("/health")

        const csp = res.headers["content-security-policy"]
        expect(csp).toBeDefined()
        expect(csp).toContain("default-src 'none'")
        expect(csp).toContain("frame-ancestors 'none'")
    })

    it("aplica Strict-Transport-Security (HSTS) com 1 ano + subdomínios + preload", async () => {
        const res = await request(app).get("/health")

        const hsts = res.headers["strict-transport-security"]
        expect(hsts).toBeDefined()
        expect(hsts).toContain("max-age=31536000")
        expect(hsts).toContain("includeSubDomains")
        expect(hsts).toContain("preload")
    })

    it("aplica X-Frame-Options (defesa em profundidade — CSP frame-ancestors sozinho não cobre browsers antigos)", async () => {
        const res = await request(app).get("/health")

        expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN")
    })

    it("nunca expõe X-Powered-By (não vaza que o backend é Express)", async () => {
        const res = await request(app).get("/health")

        expect(res.headers["x-powered-by"]).toBeUndefined()
    })

    it("Access-Control-Allow-Origin é o CORS_ORIGIN configurado quando a requisição vem dessa origem", async () => {
        const res = await request(app).get("/health").set("Origin", env.CORS_ORIGIN)

        expect(res.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN)
    })

    it("Access-Control-Allow-Origin nunca reflete a Origin da requisição — fica fixo no CORS_ORIGIN configurado", async () => {
        // Se o CORS refletisse qualquer Origin recebida (bug clássico de
        // configuração, ex.: `origin: (o, cb) => cb(null, true)`), um site
        // malicioso com `credentials: 'include'` conseguiria ler respostas
        // autenticadas de qualquer usuário que o visitasse.
        const foreignOrigin = "http://attacker.invalid"
        const res = await request(app).get("/health").set("Origin", foreignOrigin)

        expect(res.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN)
        expect(res.headers["access-control-allow-origin"]).not.toBe(foreignOrigin)
    })
})
