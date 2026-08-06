import { promises as dns } from "dns"
import ipaddr from "ipaddr.js"

// Portas comumente associadas a serviços internos sensíveis (SSH, RDP,
// bancos de dados, APIs de administração de container/orquestração) — sem
// uso legítimo em nenhum protocolo de medidor suportado hoje (MQTT,
// MODBUS_TCP, ETHERNET_IP, PROFINET). Defesa em profundidade: mesmo um host
// coberto pela allowlist não deveria ficar alcançável nessas portas através
// deste fluxo.
const DENIED_PORTS = new Set([
    22, 23, 25, 110, 143, 445, 465, 587, 993, 995,
    1433, 1521, 2375, 2376, 3306, 3389, 5432, 5900,
    6379, 8500, 9200, 9300, 11211, 27017, 6443,
])

export function isPortAllowed(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535 && !DENIED_PORTS.has(port)
}

export type AllowlistEntry =
    | { kind: "host"; value: string }
    | { kind: "cidr"; value: string }

// IOT_ALLOWED_HOSTS: lista separada por vírgula de hostnames e/ou CIDRs
// (ex.: "broker.local,192.168.0.0/16,10.0.5.20/32") — único jeito de um
// medidor apontar para rede interna/local, que é negada por padrão.
export function parseAllowlist(raw: string | undefined): AllowlistEntry[] {
    if (!raw) return []

    return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry): AllowlistEntry =>
            entry.includes("/")
                ? { kind: "cidr", value: entry }
                : { kind: "host", value: entry.toLowerCase() },
        )
}

function matchesCidr(ip: ipaddr.IPv4 | ipaddr.IPv6, cidr: string): boolean {
    try {
        // `instanceof` (em vez de comparar `.kind()`) porque só ele estreita
        // o tipo da união para o TypeScript — `IPv4.parseCIDR`/`match` não
        // aceitam o par IPv6 e vice-versa. Se o CIDR configurado for da
        // família errada para este IP, `parseCIDR` lança e cai no catch.
        if (ip instanceof ipaddr.IPv4) {
            const [rangeAddress, prefixLength] = ipaddr.IPv4.parseCIDR(cidr)
            return ip.match(rangeAddress, prefixLength)
        }

        const [rangeAddress, prefixLength] = ipaddr.IPv6.parseCIDR(cidr)
        return ip.match(rangeAddress, prefixLength)
    } catch {
        // CIDR malformado na env, ou família incompatível — trata como "não
        // cobre este IP" em vez de derrubar a aplicação; falha fechada
        // (nega), não aberta.
        return false
    }
}

export function isHostAllowlisted(host: string, allowlist: AllowlistEntry[]): boolean {
    const lowerHost = host.toLowerCase()
    return allowlist.some((entry) => entry.kind === "host" && entry.value === lowerHost)
}

export function isAddressAllowlisted(ip: string, allowlist: AllowlistEntry[]): boolean {
    const parsedIp = ipaddr.process(ip)
    return allowlist.some((entry) => entry.kind === "cidr" && matchesCidr(parsedIp, entry.value))
}

// Classificação "seguro por padrão": só endereço unicast público passa sem
// allowlist explícita. `ipaddr.process()` resolve IPv6 mapeado para IPv4
// (`::ffff:127.0.0.1`) antes de classificar — sem isso essa forma escaparia
// da checagem de loopback (a única finalidade de mapear teria sido burlar
// o filtro).
export function isPublicUnicast(ip: string): boolean {
    return ipaddr.process(ip).range() === "unicast"
}

// Resolução real do hostname — cobre o caso de um DNS que resolve para
// 127.0.0.1/RFC1918: checagem puramente textual do host não pega isso.
export async function resolveHostAddresses(host: string): Promise<string[]> {
    if (ipaddr.isValid(host)) return [host]

    const results = await dns.lookup(host, { all: true, verbatim: true })
    return results.map((result) => result.address)
}

export interface OutboundHostCheckResult {
    allowed: boolean
    reason?: string
}

// Ponto único de validação SSRF para destinos de saída de medidor —
// aplicado no service, antes de persistir (#10 — A01). `resolveFn` é
// injetável para tornar a resolução de hostname determinística em teste,
// sem depender de DNS real (mesmo padrão de `resolveLogLevel`/
// `resolveTransport` em `shared/logger/logger.ts`: função pura recebe o que
// precisa por parâmetro em vez de acoplar no I/O real).
export async function checkOutboundHost(
    host: string,
    port: number,
    allowlistRaw: string | undefined,
    resolveFn: (host: string) => Promise<string[]> = resolveHostAddresses,
): Promise<OutboundHostCheckResult> {
    if (!isPortAllowed(port)) {
        return { allowed: false, reason: `Porta ${port} não é permitida para conexão de saída` }
    }

    const allowlist = parseAllowlist(allowlistRaw)

    // Hostname explicitamente confiado pelo operador — não precisa resolver
    // via DNS para decidir (é exatamente o caso legítimo de medidor em rede
    // local que a allowlist existe para cobrir).
    if (isHostAllowlisted(host, allowlist)) {
        return { allowed: true }
    }

    let addresses: string[]
    try {
        addresses = await resolveFn(host)
    } catch {
        return { allowed: false, reason: `Não foi possível resolver o host "${host}"` }
    }

    if (addresses.length === 0) {
        return { allowed: false, reason: `Não foi possível resolver o host "${host}"` }
    }

    // Nega se QUALQUER endereço resolvido for inseguro — um DNS controlado
    // pelo atacante pode devolver um IP público "de fachada" junto de um IP
    // interno real; negar por padrão vale para o conjunto inteiro.
    for (const address of addresses) {
        if (isAddressAllowlisted(address, allowlist)) continue
        if (!isPublicUnicast(address)) {
            return {
                allowed: false,
                reason: `Destino "${host}" resolve para um endereço interno ou reservado, não permitido`,
            }
        }
    }

    return { allowed: true }
}
