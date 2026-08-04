import { useEffect, useMemo } from "react"
import { Link } from "react-router"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowLeft, Zap } from "lucide-react"
import { slugify } from "@/lib/slugify"
import { industryMarkdownComponents } from "@/lib/markdown/industryMarkdownComponents"

interface LegalDocumentPageProps {
    title: string
    markdown: string
}

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
 *
 * `industryMarkdownComponents`/`slugify` são compartilhados com `AboutPage`
 * (#137) — extraídos daqui quando ela virou o 2º consumidor real.
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
                        <ReactMarkdown components={industryMarkdownComponents} remarkPlugins={[remarkGfm]}>
                            {markdown}
                        </ReactMarkdown>
                    </article>
                </div>
            </div>
        </div>
    )
}
