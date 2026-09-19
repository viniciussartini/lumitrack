import {
    LayoutDashboard,
    FileText,
    ChartLine,
    Bell,
    Zap,
    Info,
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
 * Home v2.dc.html, `renderVals()`): Painel · Análise · Relatórios ·
 * Alertas · Distribuidoras. "Sobre o projeto" entra por último — item
 * institucional, fora do conjunto dos itens funcionais do protótipo.
 *
 * "Análise" aponta para `/propriedades` e cobre também as rotas filhas
 * (detalhe de propriedade, área e dispositivo). "Histórico" ainda não
 * consta: entra junto com a tela, não como rota vazia.
 *
 * "Segurança" e "Configurações" não estão aqui de propósito — vivem só no
 * menu do usuário (`UserMenu.tsx`), não duplicados na navegação principal.
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
        label: "Análise",
        icon: ChartLine,
    },
    {
        to: "/relatorios",
        label: "Relatórios",
        icon: FileText,
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
        to: "/sobre",
        label: "Sobre o projeto",
        icon: Info,
    },
] as const
