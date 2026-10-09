import { cn } from "@/lib/cn"
import { GOAL_TONE_TEXT_CLASS, type GoalTone } from "@/lib/goals"

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
