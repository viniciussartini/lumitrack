import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import aboutMarkdown from "@/content/about.md?raw"
import { industryMarkdownComponents } from "@/lib/markdown/industryMarkdownComponents"
import { GITHUB_REPO_URL, GitHubIcon } from "@/components/ui/GitHubIcon"

// TODO(design): aguardando handoff — Sobre o projeto. Não existe tela
// equivalente em `.claude/design/2026-07-31-lumitrack-completo/` (única
// rota do roadmap sem handoff, decisão do usuário 2026-08-04) — versão
// provisória reaproveitando o vocabulário Industry já estabelecido
// (mesmo tratamento de `LegalDocumentPage`/LGPD: markdown canônico +
// `.blueprint` pra destaque), sem inventar nada fora dele.
//
// Sem kicker/h1 local: a rota vive dentro do AppShell, e o Header (#136)
// já mostra o título contextual (`config/pageTitles.ts`) — duplicar aqui
// reproduziria o mesmo bug de dois `<h1>` corrigido em #136.
export const AboutPage = () => (
    <div className="flex flex-col gap-8">
        <article className="lt-legal max-w-[760px]">
            <ReactMarkdown components={industryMarkdownComponents} remarkPlugins={[remarkGfm]}>
                {aboutMarkdown}
            </ReactMarkdown>
        </article>

        <div className="blueprint flex max-w-[760px] flex-wrap items-center justify-between gap-4 p-[26px]">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <div>
                <span className="font-heading text-accent-700 block text-xs font-semibold tracking-[.08em] uppercase">
                    Código aberto
                </span>
                <p className="text-muted mt-1.5 text-sm">
                    O código do LumiTrack está publicado no GitHub.
                </p>
            </div>
            <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ver o repositório do LumiTrack no GitHub (abre em nova aba)"
                className="btn btn-secondary"
            >
                <GitHubIcon className="h-4 w-4" />
                Ver no GitHub
            </a>
        </div>
    </div>
)
