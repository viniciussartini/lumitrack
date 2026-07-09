// Converte a string de expiração do JWT (ex: "15m", "1h", "7d") para milissegundos.
// Usado tanto para calcular o `expiresAt` persistido no banco quanto o
// `maxAge` dos cookies de sessão — única fonte, evita drift entre os dois.
// Suporta: s (segundos), m (minutos), h (horas), d (dias)
export function parseJwtExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/)

    if (!match) {
        // Fallback seguro: 15 minutos
        return 15 * 60 * 1000
    }

    const value = parseInt(match[1]!)
    const unit = match[2]!

    const multipliers: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    }

    return value * (multipliers[unit] ?? 60 * 1000)
}
