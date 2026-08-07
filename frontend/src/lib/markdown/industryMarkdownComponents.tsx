import { Link } from "react-router"
import type { Components } from "react-markdown"
import { AlertTriangle } from "lucide-react"
import { slugify } from "@/lib/slugify"

/**
 * Mapeia elementos markdown pros tokens Industry (`.blueprint`/`.lt-legal`/
 * `.table`), consistente com o restante do app. Extraído de
 * `LegalDocumentPage.tsx` quando `AboutPage` virou o 2º consumidor
 * real — mesmo critério de promoção já usado em `getDisplayInfo`/
 * `useLiveMeterReading`. Documentos que usam isto: `src/legal/*.md`
 * (Política de Privacidade, Termos de Uso) e `src/content/about.md`
 * (Sobre o projeto).
 */
export const industryMarkdownComponents: Components = {
    h1: ({ children }) => (
        <h1 className="font-heading text-[clamp(28px,3.4vw,44px)] leading-[1.05] font-semibold uppercase">
            {children}
        </h1>
    ),
    h2: ({ children }) => <h2 id={slugify(String(children))}>{children}</h2>,
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
