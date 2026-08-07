import { Construction, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/cn"

interface PlaceholderPageProps {
    description?: string
    icon?: LucideIcon
}

/**
 * Página "em construção" — usada para módulos que ainda não foram
 * implementados, mas precisam aparecer na navegação.
 *
 * Mantém a sensação de app completo até a slice respectiva ser entregue.
 * Sem título próprio — o Header já mostra o título da rota; o único
 * consumidor hoje (`SimulationPage`) não precisa repeti-lo aqui.
 */
export const PlaceholderPage = ({
    description = "Esta seção está em desenvolvimento e estará disponível em breve.",
    icon: Icon = Construction,
}: PlaceholderPageProps) => (
    <div className="flex flex-col gap-6">
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center",
                "border-slate-300 bg-white",
                "dark:border-slate-700 dark:bg-slate-900",
            )}
        >
            <Icon className="h-12 w-12 text-slate-400 dark:text-slate-600" aria-hidden="true" />
            <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">{description}</p>
        </div>
    </div>
)
