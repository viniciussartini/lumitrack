import { Zap } from "lucide-react"
import { formatKwhPrice, formatPercent } from "@/lib/format"
import type { Distributor } from "@/types/distributor.types"
import { cn } from "@/lib/cn"

interface DistributorCardProps {
    distributor: Distributor
}

/**
 * Card de distribuidora — catálogo global somente leitura (Fase 5).
 * Sem link de edição/menu — o catálogo é seedado, sem CRUD pelo usuário.
 */
export const DistributorCard = ({ distributor }: DistributorCardProps) => (
    <div
        className={cn(
            "flex flex-col gap-4 rounded-lg border bg-white p-5",
            "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
        )}
        data-testid={`distributor-card-${distributor.id}`}
    >
        <div className="flex items-start gap-3">
            <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-500/10"
                aria-hidden="true"
            >
                <Zap className="h-5 w-5 text-brand-500" />
            </div>
            <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">
                    {distributor.name}
                </h3>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {distributor.cnpj} · {distributor.state}
                </p>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-medium text-slate-900 dark:text-slate-100">
                TUSD {formatKwhPrice(distributor.tusdPerKwh)}
            </span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
                TE {formatKwhPrice(distributor.tePerKwh)}
            </span>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
            <div className="flex gap-1">
                <dt className="text-slate-500 dark:text-slate-400">ICMS:</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-300">
                    {formatPercent(distributor.icmsRate)}
                </dd>
            </div>
            <div className="flex gap-1">
                <dt className="text-slate-500 dark:text-slate-400">PIS:</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-300">
                    {formatPercent(distributor.pisRate)}
                </dd>
            </div>
            <div className="flex gap-1">
                <dt className="text-slate-500 dark:text-slate-400">COFINS:</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-300">
                    {formatPercent(distributor.cofinsRate)}
                </dd>
            </div>
        </dl>
    </div>
)
