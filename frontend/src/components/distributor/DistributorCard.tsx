import { Zap } from "lucide-react"
import { formatKwhPrice, formatPercent } from "@/lib/format"
import type { Distributor } from "@/types/distributor.types"
import { cn } from "@/lib/cn"

interface DistributorCardProps {
    distributor: Distributor
}

/**
 * Tarifa efetiva por kWh (com tributos "por dentro"), sem bandeira — mesma
 * fórmula de `TariffService.calculateCore` (backend/src/shared/tariff/
 * tariff.service.ts), aplicada a 1 kWh: total = (tusd+te) / (1 − Σ tributos).
 * Bandeira vigente não entra aqui — catálogo de distribuidoras não carrega
 * bandeira.
 */
const computeEffectiveTariffPerKwh = (distributor: Distributor): number => {
    const taxRateSum = distributor.icmsRate + distributor.pisRate + distributor.cofinsRate
    return (distributor.tusdPerKwh + distributor.tePerKwh) / (1 - taxRateSum)
}

/**
 * Card de distribuidora — catálogo global somente leitura.
 * Sem link de edição/menu — o catálogo é seedado, sem CRUD pelo usuário.
 */
export const DistributorCard = ({ distributor }: DistributorCardProps) => (
    <div className="blueprint flex flex-col p-0" data-testid={`distributor-card-${distributor.id}`}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />

        <div className="flex items-start gap-3 p-5">
            <div
                className="border-accent text-accent flex h-11 w-11 shrink-0 items-center justify-center border"
                aria-hidden="true"
            >
                <Zap className="h-22px w-22px" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="font-heading truncate text-lg font-semibold uppercase">
                    {distributor.name}
                </h3>
                <p className={cn("text-muted mt-1.5 text-xs", "font-features-['tnum'_1]")}>
                    {distributor.cnpj} · {distributor.state}
                </p>
            </div>
        </div>

        <div className="border-divider grid grid-cols-2 border-t">
            <div className="border-divider border-r px-5 py-3.5">
                <div className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
                    TUSD
                </div>
                <div
                    className={cn(
                        "font-heading text-19 mt-1.5 font-semibold",
                        "font-features-['tnum'_1]",
                    )}
                >
                    {formatKwhPrice(distributor.tusdPerKwh)}
                </div>
            </div>
            <div className="px-5 py-3.5">
                <div className="font-heading text-muted text-10 font-semibold tracking-[.07em] uppercase">
                    TE
                </div>
                <div
                    className={cn(
                        "font-heading text-19 mt-1.5 font-semibold",
                        "font-features-['tnum'_1]",
                    )}
                >
                    {formatKwhPrice(distributor.tePerKwh)}
                </div>
            </div>
        </div>

        <div
            className="border-divider flex flex-wrap items-center gap-3.5 border-t px-5 py-3.5"
            style={{ background: "color-mix(in srgb, var(--color-accent) 3%, transparent)" }}
        >
            <span className="font-heading text-muted text-10 font-semibold tracking-[.06em] uppercase">
                Tributos
            </span>
            <span className={cn("text-xs", "font-features-['tnum'_1]")}>
                <span className="text-muted">ICMS</span>{" "}
                <b className="font-semibold">{formatPercent(distributor.icmsRate)}</b>
            </span>
            <span className={cn("text-xs", "font-features-['tnum'_1]")}>
                <span className="text-muted">PIS</span>{" "}
                <b className="font-semibold">{formatPercent(distributor.pisRate)}</b>
            </span>
            <span className={cn("text-xs", "font-features-['tnum'_1]")}>
                <span className="text-muted">COFINS</span>{" "}
                <b className="font-semibold">{formatPercent(distributor.cofinsRate)}</b>
            </span>
            <span className={cn("text-12-5 ml-auto", "font-features-['tnum'_1]")}>
                <span className="text-muted">Efetiva</span>{" "}
                <b className="text-accent-700 font-bold">
                    {formatKwhPrice(computeEffectiveTariffPerKwh(distributor))}
                </b>
            </span>
        </div>
    </div>
)
