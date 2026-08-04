import {
    LayoutDashboard,
    Home,
    FileText,
    ChartNoAxesColumn,
    Bell,
    Zap,
    Shield,
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
 * A ordem aqui é a ordem de exibição, alinhada ao handoff (LumiTrack
 * Home.dc.html, linhas 1356-1364): Painel · Propriedades · Relatórios ·
 * Simulações · Alertas · Distribuidoras · Segurança.
 *
 * Adicionar um novo módulo? Adicione aqui + crie a rota no AppRouter.
 */
export const NAV_ITEMS: readonly NavItem[] = [
    {
        to: "/dashboard",
        label: "Painel",
        icon: LayoutDashboard,
    },
    {
        to: "/propriedades",
        label: "Propriedades",
        icon: Home,
    },
    {
        to: "/relatorios",
        label: "Relatórios",
        icon: FileText,
    },
    {
        to: "/simulacao",
        label: "Simulações",
        icon: ChartNoAxesColumn,
    },
    {
        to: "/alertas",
        label: "Alertas",
        icon: Bell,
    },
    {
        to: "/distribuidoras",
        label: "Distribuidoras",
        icon: Zap,
    },
    {
        to: "/seguranca",
        label: "Segurança",
        icon: Shield,
    },
] as const
