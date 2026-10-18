import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), "utf-8")

const indexHtml = read("frontend/index.html")
const caddyfile = read("deploy/Caddyfile")
const renderYaml = read("render.yaml")
const staticSiteBlock = renderYaml.slice(renderYaml.indexOf("runtime: static"))

const CONNECT_EXTRA_PLACEHOLDER = "%VITE_CSP_CONNECT_EXTRA%"

const withoutHtmlComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, "")

const normalizePolicy = (policy: string): string =>
    policy
        .split(";")
        .map((directive) => directive.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .join("; ")

const firstGroup = (match: RegExpMatchArray | null, notFoundMessage: string): string => {
    const value = match?.[1]
    if (value === undefined) throw new Error(notFoundMessage)
    return value
}

const metaPolicy = (): string => {
    const match = withoutHtmlComments(indexHtml).match(
        /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
    )
    return firstGroup(match, "CSP <meta> não encontrada em frontend/index.html")
}

const caddyHeader = (name: string): string => {
    const match = caddyfile.match(new RegExp(`^\\s*(?:header \\??)?${name}\\s+"([^"]+)"`, "m"))
    return firstGroup(match, `${name} não encontrado no Caddyfile`)
}

const renderHeader = (name: string): string => {
    const match = staticSiteBlock.match(
        new RegExp(`-\\s*path:\\s*/\\*\\s*\\n\\s*name:\\s*${name}\\s*\\n\\s*value:\\s*"([^"]+)"`),
    )
    return firstGroup(match, `${name} (path /*) não encontrado nos headers do render.yaml`)
}

const renderConnectExtra = (): string => {
    const match = staticSiteBlock.match(/key:\s*VITE_CSP_CONNECT_EXTRA\s*\n\s*value:\s*(\S+)/)
    return firstGroup(match, "VITE_CSP_CONNECT_EXTRA não encontrada no render.yaml")
}

describe("CSP do index.html", () => {
    it("o hash libera exatamente o único script inline (anti-FOUC)", () => {
        const scripts = [
            ...withoutHtmlComments(indexHtml).matchAll(
                /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,
            ),
        ]
        expect(scripts).toHaveLength(1)

        const content = scripts[0]?.[1] ?? ""
        const digest = createHash("sha256").update(content, "utf8").digest("base64")
        expect(metaPolicy()).toContain(`'sha256-${digest}'`)
    })
})

describe("CSP por header", () => {
    it("o Caddy envia a mesma política da <meta> (sem origem extra no connect-src)", () => {
        const expected = normalizePolicy(metaPolicy().replace(CONNECT_EXTRA_PLACEHOLDER, ""))
        expect(normalizePolicy(caddyHeader("Content-Security-Policy"))).toBe(expected)
    })

    it("o Render envia a mesma política da <meta>, com a origem da API no connect-src", () => {
        const expected = normalizePolicy(
            metaPolicy().replace(CONNECT_EXTRA_PLACEHOLDER, renderConnectExtra()),
        )
        expect(normalizePolicy(renderHeader("Content-Security-Policy"))).toBe(expected)
    })

    it("proíbe enquadramento em iframe nos dois ambientes", () => {
        expect(caddyHeader("Content-Security-Policy")).toContain("frame-ancestors 'none'")
        expect(renderHeader("Content-Security-Policy")).toContain("frame-ancestors 'none'")
        expect(renderHeader("X-Frame-Options")).toBe("DENY")
    })
})

describe("cabeçalhos de segurança do site estático do Render", () => {
    it.each([
        ["Strict-Transport-Security", "Strict-Transport-Security"],
        ["X-Content-Type-Options", "X-Content-Type-Options"],
        ["Referrer-Policy", "Referrer-Policy"],
        ["Permissions-Policy", "Permissions-Policy"],
    ])("%s é o mesmo do Caddy", (renderName, caddyName) => {
        expect(renderHeader(renderName)).toBe(caddyHeader(caddyName))
    })
})

describe("Referrer-Policy", () => {
    it("manda só a origem nos dois ambientes: a URL com token não sai nem para a própria API", () => {
        expect(caddyHeader("Referrer-Policy")).toBe("strict-origin")
        expect(renderHeader("Referrer-Policy")).toBe("strict-origin")
    })
})

describe("CSP no Caddy", () => {
    it("fica em diretiva própria com `?`, para a CSP mais restrita da API vencer em /api/*", () => {
        expect(caddyfile).toMatch(/^\s*header \?Content-Security-Policy\s+"/m)
    })
})

describe("cache do SPA no Caddy", () => {
    it("o HTML e demais arquivos fora de /assets/ sempre revalidam", () => {
        expect(caddyfile).toMatch(/@revalida\s+not path \/assets\/\*/)
        expect(caddyfile).toMatch(/header @revalida Cache-Control "no-cache"/)
    })

    it("/assets/* continua imutável", () => {
        expect(caddyfile).toMatch(
            /header @static Cache-Control "public, max-age=31536000, immutable"/,
        )
    })
})
