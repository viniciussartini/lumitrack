import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/cn"

interface EmptyStateProps {
    icon: LucideIcon
    title: string
    description?: string
    /** Ação primária — geralmente um <Link> ou <Button> */
    action?: ReactNode
    className?: string
}

/**
 * Componente reusável para "nada aqui ainda".
 *
 * Padrão de UX:
 *   - Ícone grande e neutro
 *   - Título conciso
 *   - Descrição que orienta o próximo passo
 *   - CTA opcional (criar primeiro item, importar, etc.)
 */
export const EmptyState = ({
    icon: Icon,
    title,
    description,
    action,
    className,
}: EmptyStateProps) => (
    <div
        className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center",
            "border-slate-300 bg-white",
            "dark:border-slate-700 dark:bg-slate-900",
            className,
        )}
    >
        <div className="rounded-full bg-slate-100 p-3 dark:bg-slate-800">
            <Icon
                className="h-8 w-8 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
            />
        </div>
        <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {title}
            </h3>
            {description && (
                <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
                    {description}
                </p>
            )}
        </div>
        {action && <div className="mt-2">{action}</div>}
    </div>
)