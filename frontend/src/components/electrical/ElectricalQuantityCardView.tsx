import type { LucideIcon } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
import { LiveBadge } from "@/components/ui/LiveBadge"
import type { ElectricalQuantityCard } from "@/lib/electricalQuantities"

interface ElectricalQuantityCardViewProps {
    card: ElectricalQuantityCard
    icon: LucideIcon
}

/**
 * Um dos 5 cards da aba "Grandezas Elétricas" (LumiTrack Home v2.dc.html,
 * bloco `gzCards`): cabeçalho com ícone + título + badge "Ao vivo", hero
 * opcional (grandeza de destaque, ex. potência ativa total) e as linhas
 * rótulo/valor. `card.rows`/`card.hero` já chegam formatados por
 * `buildElectricalQuantityCards` — este componente só desenha.
 */
export const ElectricalQuantityCardView = ({
    card,
    icon: Icon,
}: ElectricalQuantityCardViewProps) => (
    <Blueprint className="p-0" data-testid={`electrical-quantity-card-${card.key}`}>
        <div className="border-divider px-18px flex items-center gap-2.5 border-b py-3.5">
            <Icon className="text-accent h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
            <span className="font-heading text-15-5 min-w-0 flex-1 font-semibold uppercase">
                {card.title}
            </span>
            <LiveBadge
                label="Ao vivo"
                className="font-heading text-10 text-status-live shrink-0 gap-1.5 font-semibold tracking-[.07em] uppercase"
            />
        </div>

        {card.hero && (
            <div className="px-18px py-4">
                <div className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
                    {card.hero.label}
                </div>
                <div className="font-heading text-accent-700 text-34 mt-2.5 leading-none font-semibold tabular-nums">
                    {card.hero.value}
                </div>
            </div>
        )}

        {card.rows.map((row) => (
            <div
                key={row.label}
                className="border-divider px-18px flex items-baseline justify-between gap-3 border-t py-2.5"
            >
                <span className="text-muted text-13">{row.label}</span>
                <span className="font-heading text-16 font-semibold tabular-nums">{row.value}</span>
            </div>
        ))}
    </Blueprint>
)
