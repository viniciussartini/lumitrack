import { useState } from "react"
import { Laptop, Smartphone } from "lucide-react"
import { SessionRevokeDialog, type PendingRevoke } from "@/components/security/SessionRevokeDialog"
import { Button } from "@/components/ui/Button"
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
    const [pending, setPending] = useState<PendingRevoke | null>(null)
    const hasOthers = sessionsQuery.data?.some((session) => !session.isCurrent) === true

    return (
        <Blueprint className="p-0" data-testid="sessions-section">
            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <h2 className="font-heading text-17 m-0 font-semibold uppercase">Sessões ativas</h2>
                {hasOthers && (
                    <RevokeButton onClick={() => setPending({ kind: "others" })}>
                        Encerrar todas as outras
                    </RevokeButton>
                )}
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
            {sessionsQuery.isSuccess && (
                <SessionsBody sessions={sessionsQuery.data} onRevoke={setPending} />
            )}
            <SessionRevokeDialog pending={pending} onClose={() => setPending(null)} />
        </Blueprint>
    )
}

const sessionLabel = (session: Session): string =>
    session.deviceLabel ?? CHANNEL_FALLBACK[session.channel]

/** Botão de ação destrutiva do bloco, discreto como no desenho (ghost em vermelho). */
const RevokeButton = ({
    onClick,
    label,
    children,
}: {
    onClick: () => void
    label?: string
    children: string
}) => (
    <Button
        variant="ghost"
        size="sm"
        className="text-status-danger"
        aria-label={label}
        onClick={onClick}
    >
        {children}
    </Button>
)

interface SessionsBodyProps {
    sessions: Session[]
    onRevoke: (pending: PendingRevoke) => void
}

const SessionsBody = ({ sessions, onRevoke }: SessionsBodyProps) => {
    if (sessions.length === 0) {
        return <Note>Nenhuma sessão ativa encontrada.</Note>
    }

    const onlyCurrent = sessions.length === 1 && sessions[0]?.isCurrent === true

    return (
        <>
            <ul aria-label="Sessões ativas da conta" className="m-0 list-none p-0">
                {sessions.map((session) => (
                    <SessionRow key={session.id} session={session} onRevoke={onRevoke} />
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

interface SessionRowProps {
    session: Session
    onRevoke: (pending: PendingRevoke) => void
}

const SessionRow = ({ session, onRevoke }: SessionRowProps) => {
    const Icon = CHANNEL_ICON[session.channel]
    const label = sessionLabel(session)

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
                    <span>{label}</span>
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
            {session.isCurrent ? (
                <span className="w-px" aria-hidden="true" />
            ) : (
                <RevokeButton
                    label={`Encerrar sessão ${label}`}
                    onClick={() => onRevoke({ kind: "one", session, label })}
                >
                    Encerrar
                </RevokeButton>
            )}
        </li>
    )
}
