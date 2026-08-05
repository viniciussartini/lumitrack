import { matchPath } from "react-router"

export interface PageTitle {
    /** Rótulo pequeno acima do título — contexto da seção. */
    kicker: string
    /** Título grande da página. */
    title: string
}

interface PageTitleRule extends PageTitle {
    /** Padrão de rota no mesmo formato usado em `AppRouter.tsx`. */
    pattern: string
}

/**
 * Par (kicker, título) por rota — fonte única de verdade consumida pelo
 * Header (`LumiTrack Home.dc.html`, mapa `titles` na linha ~1501). Ordem
 * não importa para a correção: `matchPath` casa o pattern inteiro contra o
 * pathname, sem prefix-matching, então rotas aninhadas com o mesmo prefixo
 * (`/propriedades`, `/propriedades/:id`, `/propriedades/:propertyId/areas/:areaId`,
 * .../devices/:deviceId`) não colidem entre si.
 *
 * `/dashboard` tem um título-base aqui ("Painel") só como fallback — o
 * Header troca por "Olá, {nome}" quando há usuário autenticado (o
 * protótipo mostra "Olá, Marina" fixo; aqui é dinâmico, ver
 * `getGreetingName` em `lib/userDisplay.ts`).
 */
const PAGE_TITLE_RULES: readonly PageTitleRule[] = [
    { pattern: "/dashboard", kicker: "Painel geral", title: "Painel" },
    { pattern: "/propriedades", kicker: "Suas unidades", title: "Propriedades" },
    {
        pattern: "/propriedades/:id",
        kicker: "Suas unidades",
        title: "Detalhe da propriedade",
    },
    {
        pattern: "/propriedades/:propertyId/areas/:areaId",
        kicker: "Suas unidades",
        title: "Detalhe da área",
    },
    {
        pattern: "/propriedades/:propertyId/areas/:areaId/devices/:deviceId",
        kicker: "Suas unidades",
        title: "Detalhe do dispositivo",
    },
    { pattern: "/relatorios", kicker: "Análises", title: "Relatórios" },
    { pattern: "/simulacao", kicker: "Cenários", title: "Simulações" },
    { pattern: "/alertas", kicker: "Monitoramento", title: "Alertas" },
    { pattern: "/distribuidoras", kicker: "Catálogo", title: "Distribuidoras" },
    { pattern: "/seguranca", kicker: "Conta", title: "Segurança" },
    { pattern: "/perfil", kicker: "Conta", title: "Perfil" },
    { pattern: "/sobre", kicker: "Institucional", title: "Sobre o projeto" },
] as const

/** Mesmo fallback do protótipo (linha 1502): `titles[view] || ['LumiTrack','Painel']`. */
const FALLBACK_PAGE_TITLE: PageTitle = { kicker: "LumiTrack", title: "Painel" }

export const getPageTitle = (pathname: string): PageTitle => {
    const rule = PAGE_TITLE_RULES.find((r) => matchPath(r.pattern, pathname))
    return rule ? { kicker: rule.kicker, title: rule.title } : FALLBACK_PAGE_TITLE
}
