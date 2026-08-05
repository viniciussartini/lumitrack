import type { ReactNode } from "react"
import { Link } from "react-router"
import { LumiTrackWordmark } from "@/components/ui/LumiTrackWordmark"
import { GITHUB_REPO_URL, GitHubIcon } from "@/components/ui/GitHubIcon"

/**
 * Grade das 4 telas de autenticação (Login/Registro/Esqueci senha/Redefinir
 * senha) — largura fixa para o painel de marca não "pular" na troca de
 * tela. Handoff diverge entre si (Login usa 1.05fr, Registro e Recuperar
 * Senha usam .95fr); decisão do usuário (2026-08-04): padronizar em .95fr
 * (maioria do handoff e do código já existente) em vez de seguir a
 * divergência.
 */
export const AUTH_LAYOUT_GRID_CLASS = "grid min-h-screen lg:grid-cols-[.95fr_1fr]"

interface BrandPanelProps {
    eyebrow: string
    headline: string
    /** Omitido em telas cujo painel não tem parágrafo de apoio (ex.: Recuperar Senha). */
    description?: string
    /** Conteúdo abaixo da descrição — lista de valor (Registro), passos (Recuperar Senha). */
    extra?: ReactNode
}

/**
 * Painel de marca à esquerda das telas de autenticação (Login/Registro):
 * fundo --color-accent-900, grade decorativa em SVG, logo, headline e
 * rodapé de crédito. Ver LumiTrack Login.dc.html / Registro.dc.html.
 *
 * Oculto abaixo de lg — o protótipo não especifica comportamento mobile
 * (10-design-system.md § comportamento não especificado); a alternativa
 * óbvia é o formulário ocupar a tela inteira, que é o que resta ao
 * esconder este painel.
 */
export const BrandPanel = ({ eyebrow, headline, description, extra }: BrandPanelProps) => (
    <aside className="bg-accent-900 relative hidden flex-col justify-between overflow-hidden p-8 text-[#e6ecf2] lg:flex lg:p-14">
        <svg
            viewBox="0 0 400 400"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[.14]"
            aria-hidden="true"
        >
            <g stroke="#fff" strokeWidth="1" fill="none">
                <line x1="0" y1="80" x2="400" y2="80" />
                <line x1="0" y1="160" x2="400" y2="160" />
                <line x1="0" y1="240" x2="400" y2="240" />
                <line x1="0" y1="320" x2="400" y2="320" />
                <line x1="80" y1="0" x2="80" y2="400" />
                <line x1="160" y1="0" x2="160" y2="400" />
                <line x1="240" y1="0" x2="240" y2="400" />
                <line x1="320" y1="0" x2="320" y2="400" />
            </g>
        </svg>

        <Link to="/" className="relative inline-block no-underline">
            <LumiTrackWordmark textClassName="text-[20px]" />
        </Link>

        <div className="relative">
            <span className="font-heading text-status-highlight block text-[13px] leading-none font-semibold tracking-[.09em] uppercase">
                {eyebrow}
            </span>
            <h1 className="font-heading mt-4 max-w-[16ch] text-[clamp(30px,3.4vw,46px)] leading-[1.04] font-semibold uppercase">
                {headline}
            </h1>
            {description && (
                <p className="mt-[18px] max-w-[42ch] text-[15px] leading-[1.55] text-[#e6ecf2]/78">
                    {description}
                </p>
            )}
            {extra}
        </div>

        <div
            data-testid="brand-panel-footer"
            className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs text-[#e6ecf2]/55"
        >
            <span>© 2026 LumiTrack · Feito no Brasil</span>
            <span className="text-center whitespace-nowrap">
                Logo desenhada por{" "}
                <a
                    href="https://www.magnific.com"
                    target="_blank"
                    rel="noopener"
                    className="text-[#a9c6a2]"
                >
                    Magnific
                </a>
            </span>
            {/* Sem equivalente no handoff — acréscimo pedido pelo usuário
                (2026-08-04), ver CHANGELOG. Ícone sem texto: aria-label dá o
                nome acessível. */}
            <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ver o repositório do LumiTrack no GitHub (abre em nova aba)"
                className="justify-self-end text-[#e6ecf2]/70 hover:text-[#e6ecf2]"
            >
                <GitHubIcon className="h-4 w-4" />
            </a>
        </div>
    </aside>
)
