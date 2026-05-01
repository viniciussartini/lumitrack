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
                    "fixed inset-0 z-50 bg-black/50",
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0",
                    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                )}
            />
            <Dialog.Content
                className={cn(
                    "fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2",
                    "rounded-lg border bg-white p-6 shadow-lg",
                    "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                    "focus:outline-none",
                )}
            >
                <div className="flex items-start gap-3">
                    {variant === "danger" && (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                            <AlertTriangle
                                className="h-5 w-5 text-red-600 dark:text-red-400"
                                aria-hidden="true"
                            />
                        </div>
                    )}
                    <div className="flex-1">
                        <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {title}
                        </Dialog.Title>
                        <Dialog.Description className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                            {description}
                        </Dialog.Description>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
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