import { RealtimePowerChart } from "@/components/realtime/RealtimePowerChart"
import { LiveBadge } from "@/components/ui/LiveBadge"
import { useMeterReadingHistory } from "@/hooks/queries/useMeterReadingHistory"
import type { TargetType } from "@/types/meter.types"

interface RealtimeChartCardProps {
    targetType: TargetType
    targetId: string
    meterId: string
    title: string
    subtitle: string
}

/**
 * Card "Consumo em tempo real" (bloco `isDashboard` do handoff) — extraído
 * de `RealtimeSection` pra ser reutilizável também em Propriedade/Área/
 * Dispositivo, não só no Dashboard. Busca o histórico via
 * `useMeterReadingHistory` (persistido em `MeterReading`, não o buffer de
 * SSE do navegador) — nasce com dado real, não vazio a cada acesso à página.
 *
 * Sempre mostra a última hora — o card tinha um toggle pra alternar com uma
 * janela de 24h, removido por decisão de produto (divergência deliberada do
 * handoff, que ainda mostra as duas opções): sem a segunda opção, o toggle
 * não tinha mais função, só ocupava espaço.
 *
 * Sem estado de erro dedicado: falha na busca cai no mesmo estado vazio de
 * "Aguardando leituras" do `RealtimePowerChart` — é um card complementar,
 * não caminho crítico da página que o hospeda.
 */
export const RealtimeChartCard = ({
    targetType,
    targetId,
    meterId,
    title,
    subtitle,
}: RealtimeChartCardProps) => {
    const historyQuery = useMeterReadingHistory(targetType, targetId, meterId)
    const buckets = historyQuery.data ?? []

    return (
        <div className="blueprint p-0">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                    <span className="font-heading text-17 font-semibold uppercase">{title}</span>
                    <span className="text-muted mt-0.5 block text-xs">
                        {subtitle} · última hora
                    </span>
                </div>
                <div className="flex items-center gap-3.5">
                    <LiveBadge
                        label="Ao vivo"
                        className="font-heading text-11 gap-1.5 font-semibold tracking-[.07em] text-[#3f8f52] uppercase"
                    />
                </div>
            </div>
            <div className="p-4">
                <RealtimePowerChart buckets={buckets} />
            </div>
        </div>
    )
}
