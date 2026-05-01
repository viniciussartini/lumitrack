import { Link } from "react-router-dom"
import { Zap } from "lucide-react"
import {
    formatKwhPrice,
    formatPercent,
    formatVoltage,
    formatBrl,
} from "@/lib/format"
import {
    type Distributor,
    ELECTRICAL_SYSTEM_LABELS,
} from "@/types/distributor.types"
import { DistributorMenu } from "@/components/distributor/DistributorMenu"
import { cn } from "@/lib/cn"

interface DistributorCardProps {
    distributor: Distributor
}

/**
 * Card de distribuidora.
 *
 * Comportamento:
 *   - Click no card → /distribuidoras/:id/editar (página de edição)
 *   - Click no ⋯ → menu com "Excluir"
 *
 * O DistributorMenu fica fora do <Link> (em uma camada visual sobreposta)
 * porque ele tem seu próprio <button> e clicks que NÃO devem propagar
 * pro link envolvente. O CSS `relative` do Link + `absolute` do menu
 * resolve sem precisar tirar o link.
 */
export const DistributorCard = ({ distributor }: DistributorCardProps) => (
    <div className="relative">
        <Link
            to={`/distribuidoras/${distributor.id}/editar`}
            className={cn(
                "group flex flex-col gap-4 rounded-lg border bg-white p-5 transition",
                "border-slate-200 hover:border-brand-500 hover:shadow-md",
                "dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500",
            )}
            data-testid={`distributor-card-${distributor.id}`}
        >
            {/* Header — espaço reservado pro menu (que fica em absolute) */}
            <div className="flex items-start gap-3 pr-10">
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
                        {distributor.cnpj}
                    </p>
                </div>
            </div>

            {/* Informações primárias */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                    {formatKwhPrice(distributor.kwhPrice)}
                </span>
                <span className="text-slate-600 dark:text-slate-400">
                    {formatVoltage(distributor.workingVoltage)}
                </span>
                <span
                    className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        "bg-slate-100 text-slate-700",
                        "dark:bg-slate-800 dark:text-slate-300",
                    )}
                >
                    {ELECTRICAL_SYSTEM_LABELS[distributor.electricalSystem]}
                </span>
            </div>

            {/* Informações secundárias */}
            <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                <div className="flex gap-1">
                    <dt className="text-slate-500 dark:text-slate-400">
                        Imposto:
                    </dt>
                    <dd className="font-medium text-slate-700 dark:text-slate-300">
                        {formatPercent(distributor.taxRate)}
                    </dd>
                </div>
                <div className="flex gap-1">
                    <dt className="text-slate-500 dark:text-slate-400">
                        Ilum. pública:
                    </dt>
                    <dd className="font-medium text-slate-700 dark:text-slate-300">
                        {formatBrl(distributor.publicLightingFee)}
                    </dd>
                </div>
            </dl>
        </Link>

        {/* Menu sobreposto ao Link, no canto superior direito */}
        <div className="absolute right-3 top-3">
            <DistributorMenu distributor={distributor} />
        </div>
    </div>
)