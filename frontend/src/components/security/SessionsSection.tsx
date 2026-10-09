import { Laptop, Smartphone } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { SectionError, SectionSkeleton } from "@/components/ui/SectionState"
import { Tag } from "@/components/ui/Tag"
import { useSessions } from "@/hooks/queries/useSessions"
import { formatRelativeTime } from "@/lib/formatters/relativeTime"
import type { Session } from "@/types/session.types"

const CHANNEL_ICON = { WEB: Laptop, MOBILE: Smartphone } as const
const CHANNEL_FALLBACK = { WEB: "Navegador", MOBILE: "App móvel" } as const

/**
 * "Sessões ativas" da página Segurança (LumiTrack Home v2.dc.html, Segurança):
 * onde a conta está autenticada, com o dispositivo, a origem e o último acesso
 * de cada sessão, e o selo "Esta sessão" na do próprio navegador.
 *
 * Dispositivo e origem são só o rótulo reduzido e o IP mascarado que o servidor
 * guarda. Sessão aberta antes do registro vem sem eles: mostra o canal e
 * "Origem não registrada", nunca um dado inventado.
 */
export const SessionsSection = () => {
    const sessionsQuery = useSessions()

    return (
        <Blueprint className="p-0" data-testid="sessions-section">
            <div className="border-divider border-b px-5 py-4">
                <h2 className="font-heading text-17 m-0 font-semibold uppercase">Sessões ativas</h2>
            </div>
            {sessionsQuery.isPending && (
                <SectionSkeleton label="Carregando sessões ativas" testId="sessions-skeleton" />
            )}
            {sessionsQuery.isError && (
                <SectionError
                    message="Não foi possível carregar as sessões."
                    onRetry={() => void sessionsQuery.refetch()}
                />
            )}
            {sessionsQuery.isSuccess && <SessionsBody sessions={sessionsQuery.data} />}
        </Blueprint>
    )
}

const SessionsBody = ({ sessions }: { sessions: Session[] }) => {
    if (sessions.length === 0) {
        return <Note>Nenhuma sessão ativa encontrada.</Note>
    }

    const onlyCurrent = sessions.length === 1 && sessions[0]?.isCurrent === true

    return (
        <>
            <ul aria-label="Sessões ativas da conta" className="m-0 list-none p-0">
                {sessions.map((session) => (
                    <SessionRow key={session.id} session={session} />
                ))}
            </ul>
            {onlyCurrent && <Note>Nenhuma outra sessão ativa.</Note>}
        </>
    )
}

const Note = ({ children }: { children: string }) => (
    <p role="status" className="text-muted text-13 m-0 px-5 py-4">
        {children}
    </p>
)

const SessionRow = ({ session }: { session: Session }) => {
    const Icon = CHANNEL_ICON[session.channel]

    return (
        <li className="border-divider flex flex-wrap items-center gap-3.5 border-b px-5 py-4 last:border-b-0">
            <span
                className="border-divider text-muted flex h-9.5 w-9.5 shrink-0 items-center justify-center border"
                aria-hidden="true"
            >
                <Icon className="h-4.5 w-4.5" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-14 flex items-center gap-2 font-semibold">
                    <span>{session.deviceLabel ?? CHANNEL_FALLBACK[session.channel]}</span>
                    {session.isCurrent && (
                        <Tag variant="accent" className="text-10 font-semibold">
                            Esta sessão
                        </Tag>
                    )}
                </div>
                <div className="text-muted text-12-5 mt-0.5">
                    {session.origin ?? "Origem não registrada"}
                </div>
            </div>
            <time dateTime={session.lastAccessAt} className="text-muted text-12-5 tabular-nums">
                {formatRelativeTime(session.lastAccessAt)}
            </time>
        </li>
    )
}
