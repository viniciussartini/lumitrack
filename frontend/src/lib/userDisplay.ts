import type { User } from "@/types/auth.types"

/**
 * Deriva um nome amigável e iniciais a partir do User.
 * PF: usa firstName + lastName.
 * PJ: usa tradeName se existir, senão companyName.
 * Iniciais: 1-2 caracteres em uppercase, fallback "?" se não der.
 *
 * Promovido de UserMenu.tsx quando ProfilePage virou o 2º consumidor real
 * (mesmo critério de promoção usado em useLiveMeterReading).
 */
export const getDisplayInfo = (user: User): { name: string; initials: string } => {
    if (user.userType === "INDIVIDUAL") {
        const first = user.firstName ?? ""
        const last = user.lastName ?? ""
        const name = `${first} ${last}`.trim() || user.email
        const initials =
            (first[0] ?? "") + (last[0] ?? "") || user.email[0]
        return { name, initials: initials.toUpperCase() || "?" }
    }

    const name = user.tradeName ?? user.companyName ?? user.email
    const initials = name[0]?.toUpperCase() ?? "?"
    return { name, initials }
}
