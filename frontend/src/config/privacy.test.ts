/**
 * Trava mecânica do canal de comunicação com o titular (LGPD Art. 18 §1º +
 * Res. CD/ANPD 2/2022, Art. 11) — `VITE_PRIVACY_CONTACT_EMAIL` é resolvida
 * em build time pelo Vite, então nenhum smoke test em runtime a alcança.
 * Sem esta trava, um deploy que esqueça a variável publica o placeholder de
 * portfólio como canal oficial sem que nada acuse o erro.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const PLACEHOLDER_EMAIL = "privacidade@seu-dominio.com.br"
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const renderYamlPath = path.resolve(import.meta.dirname, "../../../render.yaml")
const renderYaml = readFileSync(renderYamlPath, "utf-8")

// Só o bloco do site estático (runtime: static) publica VITE_* em build
// time — o serviço de API (web) não declara essa variável.
const staticSiteBlock = renderYaml.slice(renderYaml.indexOf("runtime: static"))

describe("render.yaml — canal de comunicação com o titular", () => {
    it("define VITE_PRIVACY_CONTACT_EMAIL no bloco do site estático", () => {
        expect(staticSiteBlock).toMatch(/key:\s*VITE_PRIVACY_CONTACT_EMAIL/)
    })

    it("publica um endereço real, não o placeholder de portfólio", () => {
        const match = staticSiteBlock.match(
            /key:\s*VITE_PRIVACY_CONTACT_EMAIL\s*\n\s*value:\s*(\S+)/,
        )
        expect(match, "VITE_PRIVACY_CONTACT_EMAIL não encontrada no render.yaml").not.toBeNull()

        const value = match![1]
        expect(value).not.toBe(PLACEHOLDER_EMAIL)
        expect(value).toMatch(EMAIL_PATTERN)
    })
})
