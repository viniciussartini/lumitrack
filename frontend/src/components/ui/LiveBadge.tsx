import { cn } from "@/lib/cn"

interface LiveBadgeProps {
    label: string
    /**
     * Tipografia/cor/gap do wrapper — cada consumidor tinha um tratamento
     * próprio (cor sobre fundo escuro no Login, verde nas telas claras, cor
     * neutra no KPI do painel), então fica a cargo de quem chama em vez de
     * um default único. O ponto em si (tamanho/cor/animação) é fixo, vem de
     * `.lt-live-dot` (industry.css).
     */
    className?: string
}

/**
 * Ponto pulsante + rótulo — mesmo bloco repetido em 8 pontos do app antes
 * desta extração (Login, Landing, KPIs do painel, details pages de
 * Propriedade/Área/Dispositivo, MeterSection, RealtimeChartCard).
 */
export const LiveBadge = ({ label, className }: LiveBadgeProps) => (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
        <span className="lt-live-dot" aria-hidden="true" />
        {label}
    </span>
)
