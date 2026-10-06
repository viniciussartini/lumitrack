import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/cn"
import { GOAL_TONE_TEXT_CLASS, type GoalTone } from "@/lib/goals"

interface SectionSkeletonProps {
    /** Rótulo lido pelo leitor de tela enquanto o bloco carrega. */
    label: string
    testId: string
}

/** Esqueleto de carregamento dos blocos do Painel. */
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

/** Alerta de falha de um bloco do Painel, com nova tentativa. */
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

const VALUE_SIZE_CLASS = { lg: "text-26", md: "text-24" } as const

interface SectionStatProps {
    label: string
    value: string
    tone?: GoalTone
    /** Tamanho do valor: 26 px nos cards da meta, 24 px nos da demanda, como no design. */
    size?: keyof typeof VALUE_SIZE_CLASS
}

/** Card de indicador (rótulo e valor) da faixa de cards de um bloco do Painel. */
export const SectionStat = ({ label, value, tone, size = "lg" }: SectionStatProps) => (
    <div className="border-divider border-l px-5 py-4">
        <dt className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
            {label}
        </dt>
        <dd
            className={cn(
                "font-heading m-0 mt-2 leading-none font-semibold tabular-nums",
                VALUE_SIZE_CLASS[size],
                tone && GOAL_TONE_TEXT_CLASS[tone],
            )}
        >
            {value}
        </dd>
    </div>
)
