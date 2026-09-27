import { Activity, Gauge, Plug, Waves, Zap, type LucideIcon } from "lucide-react"
import { EmptyState } from "@/components/ui/EmptyState"
import { ElectricalQuantityCardView } from "@/components/electrical/ElectricalQuantityCardView"
import { useRealtimeReadings } from "@/contexts/RealtimeContext"
import {
    buildElectricalQuantityCards,
    type ElectricalQuantityKey,
} from "@/lib/electricalQuantities"

const CARD_ICONS: Record<ElectricalQuantityKey, LucideIcon> = {
    voltage: Plug,
    current: Zap,
    power: Gauge,
    powerFactor: Activity,
    thd: Waves,
}

interface ElectricalQuantitiesGridProps {
    /** `undefined` quando o alvo ainda não tem medidor vinculado. */
    meterId: string | undefined
}

/**
 * Conteúdo da aba "Grandezas Elétricas" (LumiTrack Home v2.dc.html, bloco
 * `gzView` — só a grade de 5 cards; o painel de "Análise das grandezas"
 * com janela/agregação configurável é feature à parte). Três estados:
 *
 *   - sem medidor vinculado: `EmptyState` (mesmo padrão de `MeterSection`);
 *   - medidor sem nenhuma leitura SSE ainda: mesmo bloco "Aguardando
 *     leituras..." de `RealtimePowerChart` — nunca mostra os cards com 0;
 *   - leitura presente: os 5 cards de `buildElectricalQuantityCards`, cada
 *     grandeza ausente dentro deles vira "-", não a grade inteira.
 */
export const ElectricalQuantitiesGrid = ({ meterId }: ElectricalQuantitiesGridProps) => {
    const { readingsByMeterId } = useRealtimeReadings()

    if (!meterId) {
        return (
            <EmptyState
                icon={Zap}
                title="Nenhum medidor vinculado"
                description="Vincule um medidor para acompanhar as grandezas elétricas em tempo real."
            />
        )
    }

    const reading = readingsByMeterId[meterId]

    if (!reading) {
        return (
            <div
                data-testid="electrical-quantities-empty"
                className="border-divider flex h-64 flex-col items-center justify-center gap-2 border border-dashed"
            >
                <Activity className="text-muted h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-muted text-sm">Aguardando leituras...</p>
            </div>
        )
    }

    const cards = buildElectricalQuantityCards(reading)

    return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(258px,1fr))] gap-[clamp(14px,1.6vw,20px)]">
            {cards.map((card) => (
                <ElectricalQuantityCardView
                    key={card.key}
                    card={card}
                    icon={CARD_ICONS[card.key]}
                />
            ))}
        </div>
    )
}
