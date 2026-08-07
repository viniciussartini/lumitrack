import { Home, AlertCircle } from "lucide-react"
import { Link } from "react-router"
import { useProperties } from "@/hooks/queries/useProperties"
import { usePropertySelection } from "@/hooks/usePropertySelection"
import { PropertySelector } from "@/components/dashboard/PropertySelector"
import { RealtimeSection } from "@/components/dashboard/RealtimeSection"
import { ConsumptionHistorySection } from "@/components/dashboard/ConsumptionHistorySection"
import { PropertyComparisonSection } from "@/components/dashboard/PropertyComparisonSection"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"

/**
 * Painel (`/dashboard`) — Fase 4, bloco `isDashboard` do
 * handoff (`LumiTrack Home.dc.html`, linhas 152-246). O seletor de
 * propriedade fica aqui dentro, não na topbar (o handoff não tem nenhum
 * seletor no header compartilhado). O kicker/título "Painel geral/
 * Olá, {nome}" saiu daqui para o Header — antes duplicava o mesmo
 * texto que o Header passou a mostrar.
 *
 * KPIs (Potência agora, Consumo hoje, Custo projetado, Bandeira vigente),
 * gráfico de consumo em tempo real e card de bandeiras
 * tarifárias vivem em `RealtimeSection`, escopados à propriedade
 * selecionada. Histórico de consumo mensal (`ConsumptionHistorySection`,
 * escopado à propriedade selecionada) e comparação entre propriedades
 * (`PropertyComparisonSection`, independente da seleção — compara todas)
 * são siblings de `RealtimeSection`, não aninhados nela.
 *
 * Cardinalidade assumida: pequena quantidade de propriedades por usuário
 * (sem paginação de UI no seletor) — mesmo precedente de
 * `ReportsPage`/`useDistributors(1,31)`. `pageSize` respeita o teto de 31
 * do `paginationQuerySchema` compartilhado (`backend/src/shared/pagination.ts`);
 * um valor maior (ex.: 50, usado por engano antes) é rejeitado com 422 pelo
 * backend em qualquer conta autenticada — não é validação client-side, é o
 * schema do servidor. Usuários com mais de 31 propriedades não veriam as
 * demais no seletor (mesma ressalva já aceita em `ReportsPage`).
 */
const PROPERTIES_PAGE_SIZE = 31

export const DashboardPage = () => {
    const propertiesQuery = useProperties(1, PROPERTIES_PAGE_SIZE)

    const properties = propertiesQuery.data?.items
    const { selectedId, selectedProperty, selectProperty } = usePropertySelection(properties)

    const isLoading = propertiesQuery.isLoading
    const isError = propertiesQuery.isError
    const hasNoProperties = !isLoading && !isError && properties && properties.length === 0
    const hasProperties = !isLoading && !isError && properties && properties.length > 0

    return (
        <div className="flex flex-col gap-6">
            {isLoading && <DashboardSkeleton />}

            {!isLoading && isError && (
                <ErrorState
                    message={
                        propertiesQuery.error instanceof Error
                            ? propertiesQuery.error.message
                            : "Erro ao carregar propriedades"
                    }
                    onRetry={() => void propertiesQuery.refetch()}
                />
            )}

            {hasNoProperties && (
                <EmptyState
                    icon={Home}
                    title="Nenhuma propriedade cadastrada"
                    description="Cadastre uma propriedade para acompanhar o consumo no Painel."
                    action={
                        <Button asChild>
                            <Link to="/propriedades">Cadastrar propriedade</Link>
                        </Button>
                    }
                />
            )}

            {hasProperties && (
                <>
                    <PropertySelector
                        properties={properties}
                        selectedId={selectedId}
                        onChange={selectProperty}
                    />
                    {selectedId && selectedProperty && (
                        <>
                            <RealtimeSection
                                propertyId={selectedId}
                                propertyName={selectedProperty.name}
                            />
                            <ConsumptionHistorySection
                                propertyId={selectedId}
                                propertyName={selectedProperty.name}
                            />
                        </>
                    )}
                    <PropertyComparisonSection properties={properties} />
                </>
            )}
        </div>
    )
}

// Subcomponentes locais

const DashboardSkeleton = () => (
    <div
        className="blueprint h-24 animate-pulse p-5"
        aria-busy="true"
        aria-label="Carregando painel"
    />
)

interface ErrorStateProps {
    message: string
    onRetry: () => void
}

const ErrorState = ({ message, onRetry }: ErrorStateProps) => (
    <div
        role="alert"
        className="border-status-danger/40 flex flex-col items-center justify-center gap-4 border py-12 text-center"
    >
        <AlertCircle className="text-status-danger h-8 w-8" aria-hidden="true" />
        <div>
            <h3 className="font-heading text-status-danger font-semibold uppercase">
                Não foi possível carregar
            </h3>
            <p className="text-status-danger/85 mt-1 text-sm">{message}</p>
        </div>
        <Button onClick={onRetry} variant="secondary">
            Tentar novamente
        </Button>
    </div>
)
