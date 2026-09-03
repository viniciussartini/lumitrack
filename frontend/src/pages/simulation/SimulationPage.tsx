import { Calculator } from "lucide-react"
import { PlaceholderPage } from "@/components/PlaceholderPage"

/**
 * Simulação — /simulacao (placeholder). O backend já reescreveu
 * `SimulationService` para usar o `TariffService` novo, mas a UI de
 * simulação em si fica para uma fase futura.
 */
export const SimulationPage = () => (
    <PlaceholderPage
        description="Em breve você poderá simular o custo de consumo de energia antes de gastar — por potência e uso diário, ou por kWh direto."
        icon={Calculator}
    />
)
