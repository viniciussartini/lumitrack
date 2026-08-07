import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Blueprint } from "@/components/ui/Blueprint"
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
 * Componente reusável para "nada aqui ainda". Sem spec própria no bundle —
 * composto a partir do frame .blueprint (mesmo padrão "desenho de linha"
 * usado nos protótipos, ver Blueprint.tsx) com a tipografia do Industry.
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
    <Blueprint
        className={cn(
            "flex flex-col items-center justify-center gap-4 py-16 text-center",
            className,
        )}
    >
        <div className="border-divider flex h-14 w-14 items-center justify-center border">
            <Icon className="text-muted h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
            <h3 className="text-lg">{title}</h3>
            {description && <p className="text-muted max-w-md text-sm">{description}</p>}
        </div>
        {action && <div className="mt-2">{action}</div>}
    </Blueprint>
)
