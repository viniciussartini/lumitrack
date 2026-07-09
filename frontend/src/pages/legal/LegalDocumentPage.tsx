import { useEffect } from "react"
import { Link } from "react-router-dom"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowLeft, Zap } from "lucide-react"

interface LegalDocumentPageProps {
    title: string
    markdown: string
}

// Mapeia elementos markdown para classes Tailwind consistentes com o resto da app
// (mesmos tokens de cor usados em RegisterPage/LoginPage).
const markdownComponents: Components = {
    h1: ({ children }) => (
        <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-slate-100">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="mt-8 mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {children}
        </h2>
    ),
    p: ({ children }) => (
        <p className="mb-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {children}
        </p>
    ),
    ul: ({ children }) => (
        <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            {children}
        </ul>
    ),
    li: ({ children }) => <li>{children}</li>,
    strong: ({ children }) => (
        <strong className="font-semibold text-slate-800 dark:text-slate-200">{children}</strong>
    ),
    a: ({ children, href }) => (
        <Link to={href ?? "#"} className="font-medium text-brand-500 hover:text-brand-700">
            {children}
        </Link>
    ),
    blockquote: ({ children }) => (
        <blockquote className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            {children}
        </blockquote>
    ),
    table: ({ children }) => (
        <div className="mb-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="border-b border-slate-200 dark:border-slate-800">{children}</thead>
    ),
    th: ({ children }) => (
        <th className="px-2 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="border-b border-slate-100 px-2 py-2 align-top text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {children}
        </td>
    ),
}

/**
 * Layout compartilhado para documentos legais (Política de Privacidade,
 * Termos de Uso). Renderiza o markdown canônico em `src/legal/*.md` —
 * fonte única de verdade, sem duplicação entre documento e UI.
 */
export const LegalDocumentPage = ({ title, markdown }: LegalDocumentPageProps) => {
    useEffect(() => {
        document.title = `${title} — LumiTrack`
    }, [title])

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
            <div className="mx-auto w-full max-w-2xl">
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="rounded-full bg-brand-500 p-2">
                            <Zap className="h-4 w-4 text-white" aria-hidden="true" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            LumiTrack
                        </span>
                    </div>
                    <Link
                        to="/registro"
                        className="flex items-center gap-1 text-sm font-medium text-brand-500 hover:text-brand-700"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Voltar ao cadastro
                    </Link>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                        {markdown}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    )
}
