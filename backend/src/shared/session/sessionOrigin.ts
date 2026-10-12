import { isIPv4, isIPv6 } from "node:net"

type SessionChannel = "WEB" | "MOBILE"

const FALLBACK_BY_CHANNEL: Record<SessionChannel, string> = {
    WEB: "Navegador",
    MOBILE: "App móvel",
}

// A ordem importa: os navegadores derivados do Chrome também dizem "Chrome/" e
// "Safari/", e o Chrome e o Firefox no iOS dizem "iPhone ... Safari".
/** Padrões de navegador, na ordem de precedência; exportados para o teste de custo de cada um. */
export const BROWSERS: readonly [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\//, "Edge"],
    [/OPR\/|Opera/, "Opera"],
    [/FxiOS\/|Firefox\//, "Firefox"],
    [/CriOS\/|Chrome\//, "Chrome"],
    // Sem `.*` entre `Version/` e `Safari/`: com ele o custo é quadrático no
    // tamanho do user-agent, que chega sem autenticação.
    [/Version\/[\d.]+ (?:Mobile(?:\/\w+)? )?Safari\//, "Safari"],
]

// Um user-agent real tem de 130 a 200 caracteres, então os tokens de navegador
// e sistema cabem com folga; o resto só serve para alongar a entrada que o
// cliente controla. Um token além do corte não é visto: o Edge e o Opera, cujo
// token vem depois de "Chrome/", apareceriam como Chrome.
const MAX_USER_AGENT_LENGTH = 512

// O iPhone também diz "like Mac OS X", então o iOS vem antes do macOS.
const SYSTEMS: readonly [RegExp, string][] = [
    [/iPhone|iPad|iPod/, "iOS"],
    [/Android/, "Android"],
    [/Windows/, "Windows"],
    [/Macintosh|Mac OS X/, "macOS"],
    [/Linux|X11/, "Linux"],
]

const firstMatch = (table: readonly [RegExp, string][], userAgent: string): string | null =>
    table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null

/**
 * Reduz o user-agent a "Navegador · Sistema" (ex.: "Chrome · Windows"). Só esse
 * rótulo é guardado na sessão: o user-agent bruto identifica o aparelho com
 * mais precisão do que a pessoa precisa para reconhecer a própria sessão.
 *
 * Sem user-agent ou sem navegador reconhecível devolve o rótulo genérico do
 * canal; com navegador mas sem sistema reconhecido, só o navegador. Só os
 * primeiros caracteres do user-agent são examinados, para o custo não depender
 * do tamanho do cabeçalho.
 *
 * @param userAgent - Cabeçalho `User-Agent` da requisição de login ou de refresh.
 * @param channel - Canal da sessão, que define o rótulo genérico.
 * @returns O rótulo reduzido do dispositivo.
 */
export const describeDevice = (userAgent: string | null, channel: SessionChannel): string => {
    const bounded = userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null
    const browser = bounded ? firstMatch(BROWSERS, bounded) : null
    if (!bounded || !browser) return FALLBACK_BY_CHANNEL[channel]

    const system = firstMatch(SYSTEMS, bounded)
    return system ? `${browser} · ${system}` : browser
}

const IPV4_MAPPED_PREFIX = "::ffff:"
const IPV6_GROUPS = 8

// Expande o "::" e devolve os dois primeiros grupos, sem zeros à esquerda.
const ipv6Prefix = (ip: string): string => {
    const [head = "", tail = ""] = ip.split("::")
    const headGroups = head === "" ? [] : head.split(":")
    const tailGroups = tail === "" ? [] : tail.split(":")
    const zeros = ip.includes("::")
        ? Array<string>(IPV6_GROUPS - headGroups.length - tailGroups.length).fill("0")
        : []
    const groups = [...headGroups, ...zeros, ...tailGroups]
    return groups
        .slice(0, 2)
        .map((group) => group.replace(/^0+(?=.)/, ""))
        .join(":")
}

/**
 * Mascara um IP como no desenho das sessões: IPv4 mantém os dois primeiros
 * octetos (`189.45.xx.xx`) e IPv6 só os dois primeiros grupos (`2804:14c:xx`).
 * O endereço completo nunca é guardado por esta funcionalidade.
 *
 * @param ip - Endereço de `req.ip`, IPv4, IPv6 ou IPv4 mapeado em IPv6.
 * @returns O IP mascarado, ou `null` se ausente ou inválido.
 */
export const maskIp = (ip: string | null): string | null => {
    if (!ip) return null

    const plain = ip.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)
        ? ip.slice(IPV4_MAPPED_PREFIX.length)
        : ip

    if (isIPv4(plain)) {
        const [first, second] = plain.split(".")
        return `${first}.${second}.xx.xx`
    }
    if (isIPv6(plain)) return `${ipv6Prefix(plain.toLowerCase())}:xx`
    return null
}
