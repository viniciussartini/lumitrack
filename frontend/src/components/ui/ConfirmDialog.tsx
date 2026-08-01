import * as Dialog from "@radix-ui/react-dialog"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/cn"

interface ConfirmDialogProps {
    /** Controle externo da abertura */
    open: boolean
    /** Callback quando o dialog quer fechar (escape, click fora, X) */
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    /** Texto do botão de confirmação. Default: "Confirmar" */
    confirmLabel?: string
    /** Texto do botão de cancelamento. Default: "Cancelar" */
    cancelLabel?: string
    /** Variante do botão de confirmação. Default: "danger" */
    variant?: "danger" | "primary"
    /** Estado de loading no botão de confirmar */
    isLoading?: boolean
    onConfirm: () => void
}

/**
 * Diálogo de confirmação para ações destrutivas ou importantes.
 * Classes do Industry: .dialog-backdrop/.dialog/.dialog-title/.dialog-body/
 * .dialog-actions (styles/industry.css). .dialog-backdrop centra via grid
 * um filho seu — mas Overlay e Content são irmãos no Portal do Radix, não
 * pai/filho, então Content precisa da própria centralização fixed.
 *
 * Acessibilidade vem do Radix:
 *   - Focus trap (não dá pra Tab pra fora)
 *   - Escape fecha
 *   - Click fora fecha
 *   - Foco volta pro trigger ao fechar
 *   - aria-modal, role="dialog", aria-labelledby/describedby corretos
 */
export const ConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    variant = "danger",
    isLoading = false,
    onConfirm,
}: ConfirmDialogProps) => (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
            <Dialog.Overlay
                className={cn(
                    "dialog-backdrop z-50",
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0",
                    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                )}
            />
            <Dialog.Content
                className={cn(
                    "dialog fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                    "focus:outline-none",
                )}
            >
                <div className="flex items-start gap-3">
                    {variant === "danger" && (
                        <div className="border-status-danger/50 flex h-10 w-10 shrink-0 items-center justify-center border">
                            <AlertTriangle
                                className="text-status-danger h-5 w-5"
                                strokeWidth={1.5}
                                aria-hidden="true"
                            />
                        </div>
                    )}
                    <div className="flex-1">
                        <Dialog.Title className="dialog-title">{title}</Dialog.Title>
                        <Dialog.Description className="dialog-body">
                            {description}
                        </Dialog.Description>
                    </div>
                </div>

                <div className="dialog-actions">
                    <Dialog.Close asChild>
                        <Button variant="secondary" disabled={isLoading}>
                            {cancelLabel}
                        </Button>
                    </Dialog.Close>
                    <Button
                        variant={variant}
                        onClick={onConfirm}
                        isLoading={isLoading}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
)