import { useEffect, type FormEvent, type ReactNode } from "react"
import { Blueprint } from "@/components/ui/Blueprint"
import { cn } from "@/lib/cn"
import { CloseIcon } from "@/components/ui/icons"

interface ModalProps {
    eyebrow: string
    title: string
    onClose: () => void
    onSubmit: (e: FormEvent<HTMLFormElement>) => void
    children: ReactNode
    footer: ReactNode
    /** "add device" é mais largo que o default do handoff (560px vs 480px). */
    className?: string
}

/**
 * Modal de criar rede / adicionar dispositivo — `.sim-overlay`/`.sim-modal`
 * do handoff (LumiTrack IoT Simulator.dc.html). O form inteiro (header +
 * corpo + rodapé) vive dentro de um único `<form>`, igual ao protótipo —
 * não é um Dialog genérico reutilizável fora desta tela, por isso vive em
 * `components/ui/` só como wrapper de estrutura, sem virar uma lib própria.
 */
export const Modal = ({ eyebrow, title, onClose, onSubmit, children, footer, className }: ModalProps) => {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        document.addEventListener("keydown", handleEscape)
        return () => document.removeEventListener("keydown", handleEscape)
    }, [onClose])

    return (
        <div className="sim-overlay" onClick={onClose}>
            <form
                className={cn("sim-modal", className)}
                onClick={(e) => e.stopPropagation()}
                onSubmit={onSubmit}
            >
                <Blueprint className="p-0">
                    <div className="border-divider flex items-start justify-between gap-3 border-b px-[22px] py-5">
                        <div>
                            <span className="font-heading text-accent-700 block text-[11px] font-semibold tracking-[.08em] uppercase">
                                {eyebrow}
                            </span>
                            <h2 className="font-heading mt-2 text-[22px] leading-[1.05] uppercase">{title}</h2>
                        </div>
                        <button
                            type="button"
                            className="sim-iconbtn h-8 w-8"
                            onClick={onClose}
                            title="Fechar"
                            aria-label="Fechar"
                        >
                            <CloseIcon width={16} height={16} />
                        </button>
                    </div>
                    <div className="p-[22px]">{children}</div>
                    <div className="border-divider flex justify-end gap-2.5 border-t px-[22px] py-4">
                        {footer}
                    </div>
                </Blueprint>
            </form>
        </div>
    )
}
