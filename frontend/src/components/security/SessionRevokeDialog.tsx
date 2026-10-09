import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useRevokeOtherSessions, useRevokeSession } from "@/hooks/queries/useSessions"
import { extractErrorMessage } from "@/services/api"
import type { Session } from "@/types/session.types"

/** O que o usuário pediu para encerrar e ainda não confirmou. */
export type PendingRevoke = { kind: "one"; session: Session; label: string } | { kind: "others" }

interface SessionRevokeDialogProps {
    pending: PendingRevoke | null
    onClose: () => void
}

/**
 * Confirmação de "Encerrar" uma sessão ou "Encerrar todas as outras". Nada
 * é encerrado antes de confirmar. Em erro, inclusive o 403 da conta de
 * demonstração, o diálogo fecha e o motivo vai num aviso; em sucesso a lista
 * é recarregada pelo próprio hook.
 */
export const SessionRevokeDialog = ({ pending, onClose }: SessionRevokeDialogProps) => {
    const revokeOne = useRevokeSession()
    const revokeOthers = useRevokeOtherSessions()

    const finish = {
        onSuccess: onClose,
        onError: (error: Error) => {
            onClose()
            toast.error(
                pending?.kind === "others"
                    ? "Não foi possível encerrar as sessões"
                    : "Não foi possível encerrar a sessão",
                { description: extractErrorMessage(error) },
            )
        },
    }

    const confirm = () => {
        if (!pending) return
        if (pending.kind === "others") revokeOthers.mutate(undefined, finish)
        else revokeOne.mutate(pending.session.id, finish)
    }

    return (
        <ConfirmDialog
            open={pending !== null}
            onOpenChange={(open) => !open && onClose()}
            title={pending?.kind === "others" ? "Encerrar todas as outras" : "Encerrar sessão"}
            description={describe(pending)}
            confirmLabel="Encerrar"
            isLoading={revokeOne.isPending || revokeOthers.isPending}
            onConfirm={confirm}
        />
    )
}

const describe = (pending: PendingRevoke | null): string => {
    if (pending?.kind === "others") {
        return "Todas as outras sessões serão encerradas na hora e precisarão entrar de novo. Esta sessão continua ativa."
    }
    return `${pending?.label ?? "Esta sessão"} perderá o acesso na hora e precisará entrar de novo.`
}
