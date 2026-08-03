import { useEffect, useMemo } from "react"
import { Link } from "react-router"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertTriangle, ArrowLeft, Zap } from "lucide-react"

interface LegalDocumentPageProps {
    title: string
    markdown: string
}

/** `"Política de Privacidade" → "politica-de-privacidade"` — determinístico,
 * usado tanto pro `id` de cada `h2` quanto pro `href` do TOC (mesma função,
 * nunca diverge). */
const slugify = (text: string): string =>
    text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")

interface Heading {
    id: string
    text: string
}

/** Extrai os títulos `##` do markdown cru, na ordem em que aparecem — o TOC
 * lateral é gerado daqui, não de uma lista fixa, pra nunca divergir do
 * conteúdo real (fonte única de verdade). */
const extractHeadings = (markdown: string): Heading[] =>
    Array.from(markdown.matchAll(/^## (.+)$/gm)).map((match) => {
        const text = match[1]!.trim()
        return { id: slugify(text), text }
    })

// Mapeia elementos markdown pros tokens Industry (`.blueprint`/`.lt-legal`/
// `Tag`-like), consistente com o restante do app.
const markdownComponents: Components = {
    h1: ({ children }) => (
        <h1 className="font-heading text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-semibold uppercase">
            {children}
        </h1>
    ),
    h2: ({ children }) => {
        const text = String(children)
        return <h2 id={slugify(text)}>{children}</h2>
    },
    p: ({ children }) => <p className="text-muted text-[15px] leading-[1.62]">{children}</p>,
    ul: ({ children }) => <ul>{children}</ul>,
    li: ({ children }) => <li className="text-muted text-[15px] leading-[1.55]">{children}</li>,
    strong: ({ children }) => <strong>{children}</strong>,
    a: ({ children, href }) => (
        <Link to={href ?? "#"} className="text-accent-700 hover:text-accent font-medium">
            {children}
        </Link>
    ),
    blockquote: ({ children }) => (
        <div className="blueprint border-status-warning/40 my-8 flex items-start gap-3 px-5 py-[18px]">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <AlertTriangle
                className="text-status-warning mt-0.5 h-[18px] w-[18px] shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
            />
            <div className="text-status-warning/90 text-[13.5px] [&_p]:m-0 [&_p]:text-inherit">
                {children}
            </div>
        </div>
    ),
    table: ({ children }) => (
        <div className="mt-4 overflow-x-auto">
            <table className="table">{children}</table>
        </div>
    ),
}

/**
 * Layout compartilhado para documentos legais (Política de Privacidade,
 * Termos de Uso) — LumiTrack LGPD.dc.html. Renderiza o markdown canônico em
 * `src/legal/*.md` — fonte única de verdade, sem duplicação entre documento
 * e UI.
 *
 * O protótipo troca de documento via estado local numa página só; o app já
 * tem `/privacidade`/`/termos` como rotas separadas (linkadas de
 * RegisterPage, testadas) — mantidas assim, os botões de aba viram `<Link>`
 * pra rota irmã.
 */
export const LegalDocumentPage = ({ title, markdown }: LegalDocumentPageProps) => {
    useEffect(() => {
        document.title = `${title} — LumiTrack`
    }, [title])

    const headings = useMemo(() => extractHeadings(markdown), [markdown])
    const isPrivacy = title === "Política de Privacidade"

    return (
        <div className="min-h-screen px-4 py-8">
            <div className="mx-auto w-full max-w-[1080px]">
                <div className="border-divider flex items-center justify-between border-b pb-4">
                    <div className="flex items-center gap-2">
                        <span
                            className="border-accent text-accent flex h-8 w-8 items-center justify-center border"
                            aria-hidden="true"
                        >
                            <Zap className="h-4 w-4" strokeWidth={1.5} />
                        </span>
                        <span className="font-heading text-sm font-semibold uppercase">
                            LumiTrack
                        </span>
                    </div>
                    <Link
                        to="/registro"
                        className="text-muted hover:text-text flex items-center gap-1.5 text-sm"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Voltar ao cadastro
                    </Link>
                </div>

                <div className="border-divider border-b pt-8 pb-6">
                    <span className="font-heading text-accent-700 text-[13px] font-semibold tracking-[.09em] uppercase">
                        Central de privacidade · LGPD
                    </span>
                    <div className="mt-[22px] flex gap-2.5">
                        <Link to="/privacidade" className="lt-tab" data-on={isPrivacy}>
                            Política de Privacidade
                        </Link>
                        <Link to="/termos" className="lt-tab" data-on={!isPrivacy}>
                            Termos de Uso
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-12 pt-10 pb-20">
                    <aside className="lt-toc sticky top-8 flex flex-col gap-0.5">
                        <span className="font-heading text-muted mb-2.5 pl-[14px] text-[11px] font-semibold tracking-[.08em] uppercase">
                            Nesta página
                        </span>
                        {headings.map((heading) => (
                            <a key={heading.id} href={`#${heading.id}`}>
                                {heading.text}
                            </a>
                        ))}
                    </aside>

                    <article className="lt-legal min-w-0">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                            {markdown}
                        </ReactMarkdown>
                    </article>
                </div>
            </div>
        </div>
    )
}
