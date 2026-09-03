import { Mail } from "lucide-react"
import { Link } from "react-router"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import aboutMarkdown from "@/content/about.md?raw"
import { industryMarkdownComponents } from "@/lib/markdown/industryMarkdownComponents"
import { GITHUB_REPO_URL, GitHubIcon } from "@/components/ui/GitHubIcon"
import { PRIVACY_CONTACT_EMAIL } from "@/config/privacy"

// TODO(design): aguardando handoff — Sobre o projeto. Não existe tela
// equivalente em `.claude/design/2026-07-31-lumitrack-completo/` (única
// rota do roadmap sem handoff, decisão do usuário) — versão
// provisória reaproveitando o vocabulário Industry já estabelecido
// (mesmo tratamento de `LegalDocumentPage`/LGPD: markdown canônico +
// `.blueprint` pra destaque), sem inventar nada fora dele.
//
// Sem kicker/h1 local: a rota vive dentro do AppShell, e o Header
// já mostra o título contextual (`config/pageTitles.ts`) — duplicar aqui
// reproduziria o mesmo bug de dois `<h1>` já corrigido no Header.
export const AboutPage = () => (
    <div className="flex flex-col gap-8">
        <article className="lt-legal">
            <ReactMarkdown components={industryMarkdownComponents} remarkPlugins={[remarkGfm]}>
                {aboutMarkdown}
            </ReactMarkdown>
        </article>

        <div className="blueprint p-26px flex flex-wrap items-center justify-between gap-4">
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

        {/* Canal de comunicação com o titular (LGPD Art. 18 §1º + Res.
            CD/ANPD 2/2022, Art. 11). Precisa estar visível dentro do shell
            autenticado, não só no rodapé público; "Sobre o projeto" é o
            destino institucional já estabelecido, sem precisar inventar um
            rodapé novo no AppShell. */}
        <div className="blueprint p-26px flex flex-wrap items-center justify-between gap-4">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <div>
                <span className="font-heading text-accent-700 block text-xs font-semibold tracking-[.08em] uppercase">
                    Privacidade
                </span>
                <p className="text-muted mt-1.5 text-sm">
                    Para exercer os direitos do Art. 18 da LGPD (confirmação, correção,
                    anonimização/bloqueio/eliminação, oposição, informação sobre compartilhamento,
                    revogação de consentimento e revisão de decisão automatizada), use o canal de
                    privacidade. Veja também o card &quot;Privacidade &amp; dados&quot; no seu{" "}
                    <Link to="/perfil" className="text-accent hover:text-accent-700">
                        Perfil
                    </Link>
                    .
                </p>
            </div>
            <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="btn btn-secondary">
                <Mail className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                {PRIVACY_CONTACT_EMAIL}
            </a>
        </div>
    </div>
)
