import { Link } from "react-router"
import { BarChart3, Flag, TrendingUp, Zap } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { Tag } from "@/components/ui/Tag"

/**
 * Landing pública (rota `/`) — sub-issue #129 do épico #128 (Fase 5).
 * Layout conforme `LumiTrack Landing.dc.html`. Vive dentro de `PublicRoute`
 * (AppRouter.tsx): visitante não autenticado vê esta página; autenticado é
 * redirecionado para `/dashboard`, mesma regra já aplicada a /login e /registro.
 *
 * Puramente apresentacional — sem chamada de API. O painel "ao vivo" do hero
 * e os valores de bandeira usam números ilustrativos fixos (mesmo padrão já
 * estabelecido em BrandPanel/LoginPage para o painel de marca: não há sessão
 * nem medidor antes do login, então não há dado real para mostrar).
 *
 * O protótipo não especifica comportamento mobile (10-design-system.md §
 * "comportamento não especificado") — os grids de 3/4 colunas do handoff
 * colapsam progressivamente em telas menores, e os links centrais da nav
 * somem abaixo de `md` (resta marca + Entrar + Criar conta).
 */
export const LandingPage = () => (
    <div className="min-h-screen">
        <LandingNav />
        <main>
            <LandingHero />
            <LandingMetrics />
            <LandingFeatures />
            <LandingFlags />
            <LandingReports />
            <LandingAudience />
            <LandingClose />
        </main>
        <LandingFooter />
    </div>
)

// Subcomponentes locais — só usados nesta página, sem motivo pra extrair.

const NAV_LINKS = [
    { href: "#recursos", label: "Recursos" },
    { href: "#bandeiras", label: "Bandeiras" },
    { href: "#relatorios", label: "Relatórios" },
    { href: "#planos", label: "Para quem é" },
]

const LandingNav = () => (
    <nav className="nav border-divider sticky top-0 z-20 gap-7 border-b bg-white/88 backdrop-blur-sm dark:bg-black/40">
        <span className="nav-brand inline-flex items-center gap-2.5 tracking-[-.01em]">
            <img src="/lumitrack-logo.svg" alt="" className="block h-[29px] w-[26px]" />
            <span className="whitespace-nowrap">
                Lumi
                <span className="bg-linear-to-r from-[#5980A6] via-[#96B18F] to-[#D4E277] bg-clip-text text-transparent">
                    Track
                </span>
            </span>
        </span>
        <div className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="text-muted hover:text-accent-700 text-sm">
                    {link.label}
                </a>
            ))}
        </div>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
            <Link to="/login" className="text-muted hover:text-accent-700 text-sm">
                Entrar
            </Link>
            <Button asChild size="sm">
                <Link to="/registro">Criar conta</Link>
            </Button>
        </div>
    </nav>
)

const LandingHero = () => (
    <section className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-5 py-12 sm:px-8 md:py-16 lg:grid-cols-2 lg:gap-18 lg:py-24">
        <div>
            <span className="font-heading text-accent-700 block text-[13px] font-semibold tracking-[.09em] uppercase">
                Monitoramento de energia · Brasil
            </span>
            <hr className="border-divider my-3.5 border-t" />
            <h1 className="font-heading text-[clamp(40px,5.4vw,72px)] leading-[1.02] font-semibold uppercase">
                Enxergue cada
                <br />
                kWh antes que
                <br />
                ele vire <span className="text-accent">conta</span>.
            </h1>
            <p className="text-text/80 mt-[22px] max-w-[44ch] text-base leading-[1.55]">
                O LumiTrack acompanha o consumo das suas unidades em tempo real, projeta o valor
                da fatura e simula cenários para todos os grupos tarifários do sistema elétrico
                brasileiro — do residencial B1 ao industrial de alta tensão.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild size="lg">
                    <Link to="/registro">Criar conta</Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                    <a href="#recursos">Ver como funciona</a>
                </Button>
            </div>
            <div className="text-text/58 mt-[26px] flex flex-wrap gap-5 text-[12.5px]">
                <span className="inline-flex items-center gap-1.5">
                    <span className="bg-accent h-1.5 w-1.5" />
                    Pessoas físicas e jurídicas
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="bg-status-highlight h-1.5 w-1.5" />
                    Leitura 24/7
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="bg-accent h-1.5 w-1.5" />
                    Conforme a LGPD
                </span>
            </div>
        </div>

        <LandingLivePanel />
    </section>
)

/**
 * Painel "ao vivo" do hero — valores ilustrativos fixos, não dado real
 * (sem sessão/medidor nesta página). Mesmo padrão de BrandPanel/LoginPage.
 */
const LandingLivePanel = () => (
    <Blueprint className="p-0" data-testid="landing-live-panel">
        <div className="border-divider flex items-center justify-between border-b px-[18px] py-3.5">
            <span className="font-heading text-text/70 text-xs font-semibold tracking-[.1em] uppercase">
                Painel · Tempo real
            </span>
            <span className="font-heading inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[.08em] text-[#3f8f52] uppercase">
                <span
                    className="h-2 w-2 rounded-full bg-[#3f8f52]"
                    style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                />
                Ao vivo
            </span>
        </div>
        <div className="border-divider grid grid-cols-2 border-b">
            <div className="border-divider border-r p-[18px]">
                <div className="font-heading text-text/55 mb-2 text-[11px] font-semibold tracking-[.08em] uppercase">
                    Potência agora
                </div>
                <div className="font-heading text-[44px] leading-[.9] font-semibold [font-feature-settings:'tnum'_1]">
                    3,42<span className="text-text/55 ml-1 text-lg">kW</span>
                </div>
            </div>
            <div className="p-[18px]">
                <div className="font-heading text-text/55 mb-2 text-[11px] font-semibold tracking-[.08em] uppercase">
                    Custo projetado / h
                </div>
                <div className="text-status-warning font-heading text-[44px] leading-[.9] font-semibold [font-feature-settings:'tnum'_1]">
                    <span className="mr-0.5 text-lg">R$</span>2,18
                </div>
            </div>
        </div>
        <div className="flex items-center justify-between px-[18px] py-3.5">
            <Tag variant="outline" className="text-status-success border-status-success font-semibold">
                <span className="bg-status-success h-2 w-2 rounded-full" />
                Bandeira Verde
            </Tag>
            <span className="text-text/60 text-xs">sem acréscimo</span>
        </div>
    </Blueprint>
)

const METRICS = [
    { value: "−18%", accent: "text-accent", label: "na conta média nos 3 primeiros meses" },
    { value: "24/7", accent: "", label: "leitura contínua de cada unidade" },
    { value: "B1–A1", accent: "text-status-warning", label: "todos os grupos tarifários cobertos" },
    { value: "1 min", accent: "", label: "para cadastrar uma unidade e ver dados" },
]

const LandingMetrics = () => (
    <section className="mx-auto max-w-[1200px] px-5 py-2 sm:px-8">
        <Blueprint className="grid grid-cols-2 p-0 lg:grid-cols-4">
            {METRICS.map((metric, i) => (
                <div key={metric.label} className={`p-6 ${i > 0 ? "border-divider border-t lg:border-t-0 lg:border-l" : ""}`}>
                    <div className={`font-heading text-4xl leading-none font-semibold [font-feature-settings:'tnum'_1] ${metric.accent}`}>
                        {metric.value}
                    </div>
                    <div className="text-text/65 mt-2 text-[13px]">{metric.label}</div>
                </div>
            ))}
        </Blueprint>
    </section>
)

const FEATURES = [
    {
        icon: Zap,
        title: "Consumo em tempo real",
        description:
            "Veja kW e custo estimado no instante, por unidade, com projeção da fatura fechada no fim do ciclo.",
        colorClass: "border-accent text-accent",
    },
    {
        icon: TrendingUp,
        title: "Histórico e tendências",
        description:
            "Compare dias, meses e anos. Identifique picos, sazonalidade e desvios antes que virem surpresa.",
        colorClass: "border-accent text-accent",
    },
    {
        icon: BarChart3,
        title: "Comparação entre unidades",
        description: "Coloque casa, loja e galpão lado a lado. Descubra qual unidade puxa o custo e por quê.",
        colorClass: "border-accent text-accent",
    },
    {
        icon: Flag,
        title: "Bandeiras tarifárias",
        description:
            "Verde, amarela ou vermelha — o painel reflete a bandeira vigente e recalcula seu custo automaticamente.",
        colorClass: "border-status-highlight text-status-highlight",
    },
]

const LandingFeatures = () => (
    <section id="recursos" className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 md:py-14">
        <span className="font-heading text-accent-700 block text-[13px] font-semibold tracking-[.09em] uppercase">
            01 · O que você acompanha
        </span>
        <hr className="border-divider my-3.5 border-t" />
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
                <Blueprint key={feature.title} className="p-[22px]">
                    <div
                        className={`mb-4 flex h-[34px] w-[34px] items-center justify-center border-[1.5px] ${feature.colorClass}`}
                    >
                        <feature.icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <h3 className="font-heading text-[19px] uppercase">{feature.title}</h3>
                    <p className="text-text/76 mt-2.5 text-sm leading-[1.5]">{feature.description}</p>
                </Blueprint>
            ))}
        </div>
    </section>
)

/**
 * As 3 bandeiras reaproveitam os tokens `status-success/warning/danger`
 * (mesmos já usados em TariffFlagListCard) tanto na faixa superior quanto
 * no texto — o handoff usa 2 tons próximos (ex.: #3f8f52 na faixa e #2f6f3f
 * no texto) que não existem na escala de tokens; usar o mesmo token nos
 * dois lugares evita introduzir cor hardcoded fora da escala (10-design-
 * system.md § Tokens).
 */
const FLAGS = [
    {
        name: "Verde",
        description: "Condições favoráveis de geração. Sem acréscimo na tarifa — a hora mais barata de consumir.",
        value: "+ R$ 0,00",
        colorClass: "text-status-success",
        barClass: "bg-status-success",
    },
    {
        name: "Amarela",
        description: "Geração mais cara. Um acréscimo moderado por 100 kWh — hora de acompanhar de perto.",
        value: "+ R$ 1,88",
        colorClass: "text-status-warning",
        barClass: "bg-status-warning",
    },
    {
        name: "Vermelha",
        description: "Geração no limite. O maior acréscimo por 100 kWh — deslocar consumo faz diferença real.",
        value: "+ até R$ 7,87",
        colorClass: "text-status-danger",
        barClass: "bg-status-danger",
    },
]

const LandingFlags = () => (
    <section id="bandeiras" className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 md:py-14">
        <span className="font-heading text-accent-700 block text-[13px] font-semibold tracking-[.09em] uppercase">
            02 · Bandeiras tarifárias
        </span>
        <hr className="border-divider mt-3.5 mb-3 border-t" />
        <p className="text-text/78 max-w-[60ch] text-base leading-[1.55]">
            O sistema elétrico brasileiro sinaliza o custo de geração por cores. O LumiTrack
            aplica o acréscimo certo ao seu consumo, para você saber o impacto no bolso em tempo
            real.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {FLAGS.map((flag) => (
                <Blueprint key={flag.name} className="p-0">
                    <div className={`h-1.5 ${flag.barClass}`} />
                    <div className="p-[22px]">
                        <h4 className={`font-heading text-lg uppercase ${flag.colorClass}`}>{flag.name}</h4>
                        <p className="text-text/74 mt-2 text-[13.5px] leading-[1.5]">{flag.description}</p>
                        <div className={`font-heading mt-3.5 text-[22px] font-semibold [font-feature-settings:'tnum'_1] ${flag.colorClass}`}>
                            {flag.value}
                        </div>
                    </div>
                </Blueprint>
            ))}
        </div>
    </section>
)

const LandingReports = () => (
    <section
        id="relatorios"
        className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-9 px-5 py-10 sm:px-8 md:py-14 lg:grid-cols-[7fr_5fr] lg:gap-18"
    >
        <div className="order-2 lg:order-1">
            <span className="font-heading text-accent-700 block text-[13px] font-semibold tracking-[.09em] uppercase">
                03 · Relatórios e simulações
            </span>
            <hr className="border-divider mt-3.5 mb-5 border-t" />
            <h2 className="font-heading text-[clamp(28px,3.4vw,40px)] leading-[1.05] uppercase">
                Simule antes
                <br />
                de decidir
            </h2>
            <p className="text-text/78 mt-5 text-[15.5px] leading-[1.55]">
                Troque de grupo tarifário no simulador e veja o resultado em reais. Compare tarifa
                convencional, branca e horária — e exporte relatórios prontos para a diretoria ou
                para o contador.
            </p>
            <ul className="mt-[22px] flex list-none flex-col gap-3 p-0">
                <li className="flex gap-3 text-[14.5px] leading-[1.4]">
                    <span className="text-accent font-bold">→</span>Projeção de fatura por unidade e
                    consolidada
                </li>
                <li className="flex gap-3 text-[14.5px] leading-[1.4]">
                    <span className="text-accent font-bold">→</span>Comparativo entre grupos e
                    modalidades tarifárias
                </li>
                <li className="flex gap-3 text-[14.5px] leading-[1.4]">
                    <span className="text-accent font-bold">→</span>Exportação em PDF e CSV para
                    auditoria
                </li>
            </ul>
        </div>

        <Blueprint className="order-1 p-0 lg:order-2">
            <div className="border-divider flex items-center justify-between border-b px-5 py-[18px]">
                <span className="font-heading text-text/70 text-xs font-semibold tracking-[.1em] uppercase">
                    Relatório · Simulação de custo
                </span>
                <Tag variant="outline" className="font-semibold">
                    PDF · CSV
                </Tag>
            </div>
            <div className="p-5">
                <div className="mb-4 flex flex-wrap gap-2.5">
                    <Tag
                        variant="accent"
                        className="font-semibold"
                        style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
                    >
                        Convencional
                    </Tag>
                    <Tag variant="neutral">Branca</Tag>
                    <Tag variant="neutral">Ponta / Fora ponta</Tag>
                </div>
                <div className="flex items-end gap-5 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="bg-accent h-2.5 w-2.5" />
                        Tarifa atual
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="bg-status-highlight h-2.5 w-2.5" />
                        Cenário simulado
                    </span>
                </div>
            </div>
        </Blueprint>
    </section>
)

const AUDIENCE = [
    {
        tagLabel: "Pessoa física",
        tagClass: "tag-accent",
        title: "Sua casa sob controle",
        description:
            "Acompanhe o consumo do dia, receba a projeção da conta e descubra quais hábitos pesam na fatura — sem planilha, direto no painel.",
    },
    {
        tagLabel: "Pessoa jurídica",
        tagClass: "bg-status-highlight/15 text-status-highlight",
        title: "Todas as unidades, um painel",
        description:
            "Consolide filiais, compare centros de custo e simule mudanças de tarifa em escala. Relatórios prontos para gestão de energia e compliance.",
    },
]

const LandingAudience = () => (
    <section id="planos" className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 md:py-14">
        <span className="font-heading text-accent-700 block text-[13px] font-semibold tracking-[.09em] uppercase">
            04 · Para quem é
        </span>
        <hr className="border-divider my-3.5 border-t" />
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {AUDIENCE.map((item) => (
                <Blueprint key={item.tagLabel} className="p-[30px]">
                    <Tag className={`font-semibold ${item.tagClass}`}>{item.tagLabel}</Tag>
                    <h3 className="font-heading mt-4 text-2xl uppercase">{item.title}</h3>
                    <p className="text-text/78 mt-3 text-[14.5px] leading-[1.55]">{item.description}</p>
                </Blueprint>
            ))}
        </div>
    </section>
)

const LandingClose = () => (
    <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 md:py-18">
        <Blueprint className="bg-accent-900 p-8 text-white sm:p-14">
            <h2 className="font-heading max-w-[20ch] text-[clamp(28px,3.6vw,44px)] leading-[1.03] uppercase">
                Comece a monitorar suas unidades hoje.
            </h2>
            <p className="mt-[18px] max-w-[52ch] text-[15.5px] leading-[1.55] text-white/78">
                Crie sua conta em minutos, cadastre suas unidades e acompanhe o consumo em tempo
                real, com histórico, comparação e bandeiras tarifárias.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
                {/* --color-status-highlight não tem variante escura (industry.css
                    § "Cores semânticas") — o texto precisa ficar sempre escuro
                    sobre esse fundo, então não pode usar o token --color-text
                    (que inverte para claro no tema escuro). #1d1f20 é o valor
                    fixo que o próprio handoff usa para este botão específico. */}
                <Button asChild size="lg" className="bg-status-highlight border-status-highlight text-[#1d1f20]">
                    <Link to="/registro">Criar conta</Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="border-white/40 bg-transparent text-white">
                    <a href="#recursos">Ver como funciona</a>
                </Button>
            </div>
        </Blueprint>
    </section>
)

const FOOTER_COLUMNS = [
    {
        title: "Produto",
        links: [
            { href: "#recursos", label: "Recursos" },
            { href: "#bandeiras", label: "Bandeiras" },
            { href: "#relatorios", label: "Relatórios" },
            { href: "#planos", label: "Para quem é" },
        ],
    },
    {
        title: "Conta",
        links: [
            { href: "/login", label: "Entrar" },
            { href: "/registro", label: "Criar conta" },
            { href: "/esqueci-senha", label: "Recuperar senha" },
        ],
    },
    {
        title: "Legal",
        links: [
            { href: "/termos", label: "Termos de Uso" },
            // LGPD não tem rota própria — a página de Privacidade cobre o
            // conteúdo (mesmo mapeamento do bundle p/ pages/legal/, ver
            // 10-design-system.md § Bundle vigente).
            { href: "/privacidade", label: "Política de Privacidade" },
            { href: "/privacidade", label: "LGPD" },
        ],
    },
]

const LandingFooter = () => (
    <footer className="border-divider border-t">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 px-5 py-11 sm:px-8 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <div>
                <span className="font-heading inline-flex items-center gap-2.5 text-lg font-semibold">
                    <img src="/lumitrack-logo.svg" alt="" className="block h-[27px] w-6" />
                    <span className="whitespace-nowrap">
                        Lumi
                        <span className="bg-linear-to-r from-[#5980A6] via-[#96B18F] to-[#D4E277] bg-clip-text text-transparent">
                            Track
                        </span>
                    </span>
                </span>
                <p className="text-text/62 mt-3.5 max-w-[34ch] text-[13px] leading-[1.55]">
                    Monitoramento de energia elétrica para pessoas físicas e jurídicas do Brasil.
                </p>
            </div>
            {FOOTER_COLUMNS.map((column) => (
                <div key={column.title}>
                    <div className="font-heading text-text/55 mb-3.5 text-[11px] font-semibold tracking-[.09em] uppercase">
                        {column.title}
                    </div>
                    <div className="flex flex-col gap-2.5 text-[13.5px]">
                        {column.links.map((link) =>
                            link.href.startsWith("#") ? (
                                <a key={link.label} href={link.href} className="text-accent hover:text-accent-700">
                                    {link.label}
                                </a>
                            ) : (
                                <Link key={link.label} to={link.href} className="text-accent hover:text-accent-700">
                                    {link.label}
                                </Link>
                            ),
                        )}
                    </div>
                </div>
            ))}
        </div>
        <div className="border-divider border-t">
            <div className="text-text/55 mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-4.5 text-xs sm:px-8">
                <span>© 2026 LumiTrack · Todos os direitos reservados · Feito no Brasil</span>
                <span>
                    Logo desenhada por{" "}
                    <a
                        href="https://www.magnific.com"
                        target="_blank"
                        rel="noopener"
                        className="text-accent hover:text-accent-700"
                    >
                        Magnific
                    </a>
                </span>
            </div>
        </div>
    </footer>
)
