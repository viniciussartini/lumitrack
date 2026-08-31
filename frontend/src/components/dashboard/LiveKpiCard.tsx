import type { ReactNode } from "react"
import { cn } from "@/lib/cn"
import { LiveBadge } from "@/components/ui/LiveBadge"

interface LiveKpiCardProps {
    label: string
    value: ReactNode
    /** Linha pequena abaixo do valor (ex.: "≈ R$0,50/h", delta colorido). */
    subValue?: ReactNode
    /** Bolinha pulsante ao lado do label — só o KPI de dado ao vivo (SSE) usa. */
    isLive?: boolean
    /**
     * Composto com `blueprint py-18px px-5` via `cn` — as details pages de
     * entidade (Propriedade/Área/Dispositivo) usam `w-fit min-w-[220px]`
     * pra não esticar num card solto fora do grid do painel.
     */
    className?: string
}

/**
 * Card de KPI do Painel (bloco `isDashboard` do handoff) — `.blueprint` +
 * label uppercase + valor grande + linha secundária opcional. Promovido de
 * dentro de `RealtimeSection.tsx` para ser reaproveitado também por
 * `DashboardKpiRow` e pelas details pages de entidade.
 */
export const LiveKpiCard = ({
    label,
    value,
    subValue,
    isLive = false,
    className,
}: LiveKpiCardProps) => (
    <div className={cn("blueprint py-18px px-5", className)}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <div className="font-heading text-11 flex items-center gap-2 font-semibold tracking-[.07em] uppercase">
            {isLive ? <LiveBadge label={label} className="gap-2" /> : label}
        </div>
        <div className="font-heading text-30 mt-2.5 font-features-['tnum'_1] leading-none font-semibold">
            {value}
        </div>
        {subValue !== undefined && (
            <div className="text-muted mt-2 font-features-['tnum'_1] text-xs">{subValue}</div>
        )}
    </div>
)
