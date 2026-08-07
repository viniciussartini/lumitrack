import type { ReactNode } from "react"

interface LiveKpiCardProps {
    label: string
    value: string
    /** Linha pequena abaixo do valor (ex.: "≈ R$0,50/h", delta colorido). */
    subValue?: ReactNode
    /** Bolinha pulsante ao lado do label — só o KPI de dado ao vivo (SSE) usa. */
    isLive?: boolean
}

/**
 * Card de KPI do Painel (bloco `isDashboard` do handoff) — `.blueprint` +
 * label uppercase + valor grande + linha secundária opcional. Promovido de
 * dentro de `RealtimeSection.tsx` (#116) para ser reaproveitado também por
 * `DashboardKpiRow` (#117).
 */
export const LiveKpiCard = ({ label, value, subValue, isLive = false }: LiveKpiCardProps) => (
    <div className="blueprint px-5 py-[18px]">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <div className="font-heading flex items-center gap-2 text-[11px] font-semibold tracking-[.07em] uppercase">
            {isLive && (
                <span
                    className="h-2 w-2 rounded-full bg-[#3f8f52]"
                    style={{ animation: "lt-pulse 1.6s ease-in-out infinite" }}
                    aria-hidden="true"
                />
            )}
            {label}
        </div>
        <div className="font-heading mt-2.5 font-features-['tnum'_1] text-[30px] leading-none font-semibold">
            {value}
        </div>
        {subValue !== undefined && (
            <div className="text-muted mt-2 font-features-['tnum'_1] text-xs">{subValue}</div>
        )}
    </div>
)
