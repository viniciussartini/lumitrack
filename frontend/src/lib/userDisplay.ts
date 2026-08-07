import type { User } from "@/types/auth.types"

interface UserDisplayInfo {
    name: string
    initials: string
    /** "Pessoa Física" ou "Pessoa Jurídica" — usado no rodapé da Sidebar. */
    accountTypeLabel: string
}

/**
 * Deriva um nome amigável, iniciais e o rótulo do tipo de conta a partir do User.
 * PF: usa firstName + lastName.
 * PJ: usa tradeName se existir, senão companyName.
 * Iniciais: 1-2 caracteres em uppercase, fallback "?" se não der.
 *
 * Promovido de UserMenu.tsx quando ProfilePage virou o 2º consumidor real
 * (mesmo critério de promoção usado em useLiveMeterReading).
 */
export const getDisplayInfo = (user: User): UserDisplayInfo => {
    const accountTypeLabel = user.userType === "INDIVIDUAL" ? "Pessoa Física" : "Pessoa Jurídica"

    if (user.userType === "INDIVIDUAL") {
        const first = user.firstName ?? ""
        const last = user.lastName ?? ""
        const name = `${first} ${last}`.trim() || user.email
        const initials = (first[0] ?? "") + (last[0] ?? "") || (user.email[0] ?? "?")
        return { name, initials: initials.toUpperCase() || "?", accountTypeLabel }
    }

    const name = user.tradeName ?? user.companyName ?? user.email
    const initials = name[0]?.toUpperCase() ?? "?"
    return { name, initials, accountTypeLabel }
}

/**
 * Nome curto para a saudação "Olá, {nome}" do título do Painel (Header,
 * issue #136) — PF usa só o primeiro nome (o protótipo mostra "Olá,
 * Marina", não o nome completo); PJ usa tradeName/companyName, igual
 * `getDisplayInfo`. `null` quando não há nome disponível (usuário só com
 * e-mail) — o chamador decide o fallback ("Olá!").
 *
 * Movido de DashboardPage.tsx quando o Header passou a ser a fonte única
 * de verdade do título da página (antes cada view tinha seu próprio h1
 * duplicando o mesmo texto do Header).
 */
export const getGreetingName = (user: User): string | null => {
    if (user.userType === "INDIVIDUAL") return user.firstName ?? null
    return user.tradeName ?? user.companyName ?? null
}
