import type { SessionItem } from "@/modules/session/session.types.js"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/**
 * Lista fixa e representativa da conta de demonstração, no formato do desenho.
 * A conta é compartilhada entre visitantes, então a lista real exporia as
 * sessões de terceiros; os ids são fixos e não correspondem a nenhuma sessão.
 *
 * @param now - Instante de referência dos últimos acessos.
 * @returns Três sessões, a primeira marcada como a atual.
 */
export const buildDemoSessions = (now: Date): SessionItem[] => [
    {
        id: "demo-session-current",
        channel: "WEB",
        deviceLabel: "Chrome · Windows",
        origin: "189.45.xx.xx",
        lastAccessAt: now.toISOString(),
        isCurrent: true,
    },
    {
        id: "demo-session-mobile",
        channel: "MOBILE",
        deviceLabel: "App iOS · iPhone",
        origin: "189.45.xx.xx",
        lastAccessAt: new Date(now.getTime() - 2 * HOUR_MS).toISOString(),
        isCurrent: false,
    },
    {
        id: "demo-session-desktop",
        channel: "WEB",
        deviceLabel: "Firefox · macOS",
        origin: "201.17.xx.xx",
        lastAccessAt: new Date(now.getTime() - 26 * HOUR_MS).toISOString(),
        isCurrent: false,
    },
]
