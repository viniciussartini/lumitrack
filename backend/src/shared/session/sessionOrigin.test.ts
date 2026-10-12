import { describe, it, expect } from "vitest"
import { BROWSERS, describeDevice, maskIp } from "@/shared/session/sessionOrigin.js"

const CHROME_WINDOWS =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/120.0.0.0`
const OPERA_WINDOWS = `${CHROME_WINDOWS} OPR/106.0.0.0`
const FIREFOX_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0"
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"
const SAFARI_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
const SAFARI_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
const CHROME_IOS =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1"
const CHROME_ANDROID =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

describe("describeDevice", () => {
    it.each([
        [CHROME_WINDOWS, "Chrome · Windows"],
        [EDGE_WINDOWS, "Edge · Windows"],
        [OPERA_WINDOWS, "Opera · Windows"],
        [FIREFOX_MAC, "Firefox · macOS"],
        [FIREFOX_LINUX, "Firefox · Linux"],
        [SAFARI_MAC, "Safari · macOS"],
        [SAFARI_IPHONE, "Safari · iOS"],
        [CHROME_IOS, "Chrome · iOS"],
        [CHROME_ANDROID, "Chrome · Android"],
    ])("reduz o user-agent a navegador e sistema (%#)", (userAgent, expected) => {
        expect(describeDevice(userAgent, "WEB")).toBe(expected)
    })

    it("nunca devolve trechos do user-agent além do navegador e do sistema", () => {
        const label = describeDevice(CHROME_ANDROID, "MOBILE")
        expect(label).not.toMatch(/Pixel|120|537|AppleWebKit/)
    })

    it("sem user-agent, cai no rótulo genérico do canal", () => {
        expect(describeDevice(null, "WEB")).toBe("Navegador")
        expect(describeDevice(null, "MOBILE")).toBe("App móvel")
        expect(describeDevice("", "WEB")).toBe("Navegador")
    })

    it("user-agent sem navegador reconhecível cai no rótulo genérico do canal", () => {
        expect(describeDevice("curl/8.4.0", "WEB")).toBe("Navegador")
        expect(describeDevice("okhttp/4.12.0", "MOBILE")).toBe("App móvel")
    })

    it("navegador conhecido em sistema desconhecido mostra só o navegador", () => {
        expect(describeDevice("Mozilla/5.0 (PlayStation 5) Firefox/121.0", "WEB")).toBe("Firefox")
    })

    it("reconhece o Safari com e sem o token Mobile, com e sem build", () => {
        const androidStock =
            "Mozilla/5.0 (Linux; U; Android 4.4; en-us) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30"
        expect(describeDevice(androidStock, "WEB")).toBe("Safari · Android")
        expect(describeDevice(SAFARI_MAC, "WEB")).toBe("Safari · macOS")
        expect(describeDevice(SAFARI_IPHONE, "WEB")).toBe("Safari · iOS")
    })

    it("só olha o início do user-agent: navegador depois do corte não é reconhecido", () => {
        const padding = "x".repeat(600)
        expect(describeDevice(`${padding} Firefox/121.0`, "WEB")).toBe("Navegador")
        expect(describeDevice(`${CHROME_WINDOWS} ${padding}`, "WEB")).toBe("Chrome · Windows")
    })
})

// O header User-Agent chega a ~16 KB (limite de cabeçalhos do Node) sem
// autenticação, e o login demo é público: o custo precisa ser limitado. Em vez
// de um teto absoluto, compara-se o custo de uma entrada com o de outra quatro
// vezes maior: linear dá ~4x, quadrático ~16x. Pega-se o menor de três
// medições para não depender de uma pausa de GC ou de um CI sob carga.
const SMALL = 16_000
const LARGE = 64_000
const ADVERSARIAL: [string, (size: number) => string][] = [
    ["dígitos após Version/", (size) => `Version/${"1".repeat(size)}`],
    ["Version/ repetido", (size) => "Version/1.".repeat(size / 10)],
    ["espaços e Safari incompleto", (size) => `Version/1 ${" ".repeat(size)} Safari`],
]

const cost = (run: () => void): number => {
    const samples = Array.from({ length: 3 }, () => {
        const start = performance.now()
        run()
        return performance.now() - start
    })
    return Math.min(...samples)
}

const growsLinearly = (run: (size: number) => void): boolean =>
    cost(() => run(LARGE)) < 6 * cost(() => run(SMALL)) + 10

describe("custo da classificação do user-agent", () => {
    describe.each(ADVERSARIAL)("entrada adversarial (%s)", (_name, build) => {
        it("describeDevice não cresce mais que linearmente com o tamanho", () => {
            expect(growsLinearly((size) => describeDevice(build(size), "WEB"))).toBe(true)
        })

        // Sem o truncamento: cada padrão precisa ser linear por si só, para a
        // defesa do corte não esconder uma regex que volte a ter backtracking.
        it.each(BROWSERS)("o padrão %s não depende do truncamento", (pattern) => {
            expect(growsLinearly((size) => pattern.test(build(size)))).toBe(true)
        })
    })
})

describe("maskIp", () => {
    it("IPv4 mantém os dois primeiros octetos", () => {
        expect(maskIp("189.45.12.34")).toBe("189.45.xx.xx")
    })

    it("IPv4 mapeado em IPv6 é tratado como IPv4", () => {
        expect(maskIp("::ffff:189.45.12.34")).toBe("189.45.xx.xx")
    })

    it("IPv6 mantém só os dois primeiros grupos, sem zeros à esquerda", () => {
        expect(maskIp("2804:014c:1234:5678:9abc:def0:1234:5678")).toBe("2804:14c:xx")
    })

    it("IPv6 abreviado com :: é expandido antes de mascarar", () => {
        expect(maskIp("2804:14c::1")).toBe("2804:14c:xx")
        expect(maskIp("::1")).toBe("0:0:xx")
    })

    it("nunca devolve o endereço completo", () => {
        expect(maskIp("189.45.12.34")).not.toContain("12")
        expect(maskIp("2804:14c:1234:5678::1")).not.toContain("1234")
    })

    it("ausente ou inválido vira null", () => {
        expect(maskIp(null)).toBeNull()
        expect(maskIp("")).toBeNull()
        expect(maskIp("não é ip")).toBeNull()
        expect(maskIp("999.1.1.1")).toBeNull()
    })
})
