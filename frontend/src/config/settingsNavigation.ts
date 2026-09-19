import { Home, type LucideIcon } from "lucide-react"

export interface SettingsNavItem {
    /** Caminho absoluto da sub-página (ex: "/configuracoes/cadastro") */
    to: string
    /** Texto exibido no link */
    label: string
    /** Ícone do lucide-react */
    icon: LucideIcon
}

/**
 * Sub-páginas de Configurações — fonte única de verdade da sub-navegação
 * lateral, na mesma ordem do handoff (LumiTrack Home v2.dc.html).
 *
 * Nova sub-página? Adicione aqui + crie a rota filha de `/configuracoes` no
 * AppRouter + a regra de título em `pageTitles.ts`.
 */
export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
    {
        to: "/configuracoes/cadastro",
        label: "Cadastro",
        icon: Home,
    },
] as const
