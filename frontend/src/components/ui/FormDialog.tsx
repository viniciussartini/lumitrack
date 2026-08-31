import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"
import type { ReactNode } from "react"

interface FormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Rótulo curto acima do título (ex.: "Nova área"). */
    kicker: string
    title: string
    children: ReactNode
}

/**
 * Shell compartilhado para os modais de formulário (Propriedade/Medidor/
 * Área/Dispositivo) — LumiTrack Home.dc.html. Não define ações: o form
 * passado em `children` já renderiza seu próprio rodapé Cancelar/Salvar.
 *
 * `.lt-modal` usa position:fixed (não relative) porque, no Portal do Radix,
 * Overlay e Content são irmãos, não pai/filho — o mesmo motivo documentado
 * em ConfirmDialog.tsx. `.lt-overlay`/`.lt-modal` em styles/industry.css.
 *
 * Sem Dialog.Description (o design não tem texto de apoio no header) —
 * aria-describedby={undefined} silencia o warning de acessibilidade do
 * Radix, escape hatch documentado por eles para esse caso.
 */
export const FormDialog = ({ open, onOpenChange, kicker, title, children }: FormDialogProps) => (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
            <Dialog.Overlay
                className={cn(
                    "lt-overlay",
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0",
                    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                )}
            />
            <Dialog.Content
                aria-describedby={undefined}
                className={cn(
                    "lt-modal blueprint",
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                    "focus:outline-none",
                )}
            >
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <div className="pt-22px flex items-start justify-between gap-4 px-6">
                    <div>
                        <span className="font-heading text-accent-700 text-11 block font-semibold tracking-[.08em] uppercase">
                            {kicker}
                        </span>
                        <Dialog.Title className="font-heading mt-2.5 text-2xl leading-[1.05] font-semibold uppercase">
                            {title}
                        </Dialog.Title>
                    </div>
                    <Dialog.Close
                        aria-label="Fechar"
                        className="border-divider text-text flex h-[34px] w-[34px] shrink-0 items-center justify-center border bg-transparent"
                    >
                        <X className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                    </Dialog.Close>
                </div>

                <div className="pt-22px px-6 pb-6">{children}</div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
)
