import type { ReactNode } from "react"
import { Link } from "react-router"

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

        <Link
            to="/"
            className="font-heading relative inline-flex items-center gap-2.5 text-[20px] font-semibold text-[#e6ecf2] no-underline"
        >
            <img
                src="/lumitrack-logo.svg"
                alt=""
                className="block h-[29px] w-[26px] brightness-125"
            />
            <span>
                Lumi
                <span className="bg-gradient-to-r from-[#8fb0d6] via-[#a9c6a2] to-[#e2ef8f] bg-clip-text text-transparent">
                    Track
                </span>
            </span>
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

        <div className="relative flex flex-wrap items-center justify-between gap-2 text-xs text-[#e6ecf2]/55">
            <span>© 2026 LumiTrack · Feito no Brasil</span>
            <span>
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
        </div>
    </aside>
)
