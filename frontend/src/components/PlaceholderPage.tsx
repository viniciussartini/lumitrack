import { Construction, type LucideIcon } from "lucide-react"

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
        <div className="border-divider bg-surface flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center">
            <Icon className="text-muted h-12 w-12" aria-hidden="true" />
            <p className="text-muted max-w-md text-sm">{description}</p>
        </div>
    </div>
)
