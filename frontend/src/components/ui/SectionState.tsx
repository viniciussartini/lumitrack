import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/Button"

interface SectionSkeletonProps {
    /** Rótulo lido pelo leitor de tela enquanto o bloco carrega. */
    label: string
    testId: string
}

/** Esqueleto de carregamento de um bloco (card) que carrega dados do servidor. */
export const SectionSkeleton = ({ label, testId }: SectionSkeletonProps) => (
    <div
        className="flex flex-col gap-2 p-5"
        aria-busy="true"
        aria-label={label}
        data-testid={testId}
    >
        {[0, 1, 2].map((i) => (
            <div key={i} className="bg-divider h-10 animate-pulse" />
        ))}
    </div>
)

interface SectionErrorProps {
    message: string
    onRetry: () => void
}

/** Alerta de falha de um bloco (card), com nova tentativa. */
export const SectionError = ({ message, onRetry }: SectionErrorProps) => (
    <div
        role="alert"
        className="border-status-danger/40 m-5 flex flex-wrap items-center gap-3 border p-4"
    >
        <AlertCircle className="text-status-danger h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-status-danger/85 m-0 flex-1 text-sm">{message}</p>
        <Button onClick={onRetry} variant="secondary">
            Tentar novamente
        </Button>
    </div>
)
