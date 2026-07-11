import {
    LayoutDashboard,
    Zap,
    Home,
    Bell,
    BarChart3,
    Calculator,
    type LucideIcon,
} from "lucide-react"

export interface NavItem {
    /** Caminho relativo da rota (ex: "/dashboard") */
    to: string
    /** Texto exibido no link */
    label: string
    /** Ícone do lucide-react */
    icon: LucideIcon
}

/**
 * Itens da sidebar — fonte única de verdade.
 * A ordem aqui é a ordem de exibição.
 *
 * Adicionar um novo módulo? Adicione aqui + crie a rota no AppRouter.
 */
export const NAV_ITEMS: readonly NavItem[] = [
    {
        to: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
    },
    {
        to: "/distribuidoras",
        label: "Distribuidoras",
        icon: Zap,
    },
    {
        to: "/propriedades",
        label: "Propriedades",
        icon: Home,
    },
    {
        to: "/alertas",
        label: "Alertas",
        icon: Bell,
    },
    {
        to: "/relatorios",
        label: "Relatórios",
        icon: BarChart3,
    },
    {
        to: "/simulacao",
        label: "Simulação",
        icon: Calculator,
    },
] as const