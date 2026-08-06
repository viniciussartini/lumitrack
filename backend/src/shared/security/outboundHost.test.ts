import { describe, it, expect } from "vitest"
import {
    isPortAllowed,
    parseAllowlist,
    isHostAllowlisted,
    isAddressAllowlisted,
    isPublicUnicast,
    checkOutboundHost,
} from "@/shared/security/outboundHost.js"

describe("isPortAllowed", () => {
    it("aceita porta dentro da faixa válida e fora da denylist", () => {
        expect(isPortAllowed(1883)).toBe(true) // MQTT
        expect(isPortAllowed(502)).toBe(true) // Modbus TCP
        expect(isPortAllowed(44818)).toBe(true) // EtherNet/IP
    })

    it("recusa porta fora da faixa 1-65535", () => {
        expect(isPortAllowed(0)).toBe(false)
        expect(isPortAllowed(65536)).toBe(false)
        expect(isPortAllowed(-1)).toBe(false)
    })

    it("recusa porta não-inteira", () => {
        expect(isPortAllowed(80.5)).toBe(false)
    })

    it("recusa porta da denylist de serviços internos sensíveis", () => {
        expect(isPortAllowed(22)).toBe(false) // SSH
        expect(isPortAllowed(3389)).toBe(false) // RDP
        expect(isPortAllowed(6379)).toBe(false) // Redis
        expect(isPortAllowed(5432)).toBe(false) // Postgres
    })
})

describe("parseAllowlist", () => {
    it("retorna lista vazia para undefined ou string vazia", () => {
        expect(parseAllowlist(undefined)).toEqual([])
        expect(parseAllowlist("")).toEqual([])
        expect(parseAllowlist("   ")).toEqual([])
    })

    it("separa hosts e CIDRs por vírgula, com trim", () => {
        const parsed = parseAllowlist(" broker.local , 192.168.0.0/16 ,10.0.5.20/32")
        expect(parsed).toEqual([
            { kind: "host", value: "broker.local" },
            { kind: "cidr", value: "192.168.0.0/16" },
            { kind: "cidr", value: "10.0.5.20/32" },
        ])
    })

    it("normaliza hostname para minúsculas", () => {
        expect(parseAllowlist("Broker.Local")).toEqual([{ kind: "host", value: "broker.local" }])
    })
})

describe("isHostAllowlisted", () => {
    it("casa hostname exato, ignorando maiúsculas/minúsculas", () => {
        const allowlist = parseAllowlist("broker.local")
        expect(isHostAllowlisted("Broker.Local", allowlist)).toBe(true)
        expect(isHostAllowlisted("outro.host", allowlist)).toBe(false)
    })

    it("entrada CIDR não casa como hostname", () => {
        const allowlist = parseAllowlist("192.168.0.0/16")
        expect(isHostAllowlisted("192.168.0.0/16", allowlist)).toBe(false)
    })
})

describe("isAddressAllowlisted", () => {
    it("casa IP dentro do CIDR configurado", () => {
        const allowlist = parseAllowlist("192.168.0.0/16")
        expect(isAddressAllowlisted("192.168.1.50", allowlist)).toBe(true)
        expect(isAddressAllowlisted("10.0.0.1", allowlist)).toBe(false)
    })

    it("casa IPv6 dentro do CIDR configurado", () => {
        const allowlist = parseAllowlist("fd00::/8")
        expect(isAddressAllowlisted("fd00::1", allowlist)).toBe(true)
        expect(isAddressAllowlisted("2001:db8::1", allowlist)).toBe(false)
    })

    it("CIDR malformado não derruba a checagem — trata como não coberto", () => {
        const allowlist = parseAllowlist("nao-e-um-cidr/abc")
        expect(isAddressAllowlisted("192.168.1.1", allowlist)).toBe(false)
    })

    it("entrada hostname não casa como CIDR", () => {
        const allowlist = parseAllowlist("192.168.1.1")
        expect(isAddressAllowlisted("192.168.1.1", allowlist)).toBe(false)
    })
})

describe("isPublicUnicast", () => {
    it("aceita endereço IPv4 público", () => {
        expect(isPublicUnicast("1.1.1.1")).toBe(true)
    })

    it("recusa loopback", () => {
        expect(isPublicUnicast("127.0.0.1")).toBe(false)
    })

    it("recusa link-local (inclusive metadata de cloud 169.254.169.254)", () => {
        expect(isPublicUnicast("169.254.169.254")).toBe(false)
    })

    it("recusa RFC1918 (rede privada)", () => {
        expect(isPublicUnicast("10.0.0.1")).toBe(false)
        expect(isPublicUnicast("172.16.0.1")).toBe(false)
        expect(isPublicUnicast("192.168.1.1")).toBe(false)
    })

    it("recusa multicast", () => {
        expect(isPublicUnicast("224.0.0.1")).toBe(false)
    })

    it("recusa loopback/link-local/ULA em IPv6", () => {
        expect(isPublicUnicast("::1")).toBe(false)
        expect(isPublicUnicast("fe80::1")).toBe(false)
        expect(isPublicUnicast("fd00::1")).toBe(false)
    })

    it("recusa IPv4 mapeado em IPv6 para loopback — não escapa do filtro pela forma IPv6", () => {
        expect(isPublicUnicast("::ffff:127.0.0.1")).toBe(false)
    })
})

describe("checkOutboundHost", () => {
    it("permite IP literal público, sem allowlist", async () => {
        const result = await checkOutboundHost("1.1.1.1", 1883, undefined)
        expect(result.allowed).toBe(true)
    })

    it("recusa IP literal privado por padrão", async () => {
        const result = await checkOutboundHost("192.168.1.10", 1883, undefined)
        expect(result.allowed).toBe(false)
        expect(result.reason).toMatch(/interno ou reservado/)
    })

    it("permite IP privado quando coberto por CIDR na allowlist", async () => {
        const result = await checkOutboundHost("192.168.1.10", 1883, "192.168.0.0/16")
        expect(result.allowed).toBe(true)
    })

    it("recusa porta da denylist mesmo com host público", async () => {
        const result = await checkOutboundHost("1.1.1.1", 22, undefined)
        expect(result.allowed).toBe(false)
        expect(result.reason).toMatch(/Porta 22/)
    })

    it("resolve o hostname via DNS (função injetada) e recusa se resolver para IP interno", async () => {
        // Prova o requisito de "resolução, não só checagem textual": o host
        // digitado não tem nenhuma pista textual de ser interno — só o
        // resolver (aqui simulado) revela que aponta para loopback.
        const fakeResolve = async (host: string): Promise<string[]> => {
            expect(host).toBe("medidor-forjado.example")
            return ["127.0.0.1"]
        }

        const result = await checkOutboundHost("medidor-forjado.example", 1883, undefined, fakeResolve)
        expect(result.allowed).toBe(false)
    })

    it("permite hostname coberto por allowlist SEM precisar resolver via DNS", async () => {
        const resolveFn = async (): Promise<string[]> => {
            throw new Error("não deveria resolver — hostname já está na allowlist")
        }

        const result = await checkOutboundHost("broker.local", 1883, "broker.local", resolveFn)
        expect(result.allowed).toBe(true)
    })

    it("nega se QUALQUER endereço resolvido for interno, mesmo com outro público na lista", async () => {
        const fakeResolve = async (): Promise<string[]> => ["1.1.1.1", "10.0.0.5"]

        const result = await checkOutboundHost("multi-ip.example", 1883, undefined, fakeResolve)
        expect(result.allowed).toBe(false)
    })

    it("recusa quando a resolução do host falha", async () => {
        const failingResolve = async (): Promise<string[]> => {
            throw new Error("ENOTFOUND")
        }

        const result = await checkOutboundHost("nao-existe.example", 1883, undefined, failingResolve)
        expect(result.allowed).toBe(false)
        expect(result.reason).toMatch(/Não foi possível resolver/)
    })
})
