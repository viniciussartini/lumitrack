import { Home, AlertCircle } from "lucide-react"
import { Link } from "react-router"
import { useProperties } from "@/hooks/queries/useProperties"
import { usePropertySelection } from "@/hooks/usePropertySelection"
import { PropertySelector } from "@/components/dashboard/PropertySelector"
import { AreaWeightSection } from "@/components/dashboard/AreaWeightSection"
import { DemandSection } from "@/components/dashboard/DemandSection"
import { GoalSection } from "@/components/dashboard/GoalSection"
import { TodayConsumptionSection } from "@/components/dashboard/TodayConsumptionSection"
import { RealtimeSection } from "@/components/dashboard/RealtimeSection"
import { ConsumptionHistorySection } from "@/components/dashboard/ConsumptionHistorySection"
import { PropertyComparisonSection } from "@/components/dashboard/PropertyComparisonSection"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/Button"

/**
 * Painel (`/dashboard`) — bloco `isDashboard` do
 * handoff (`LumiTrack Home.dc.html`, linhas 152-246). O seletor de
 * propriedade fica aqui dentro, não na topbar (o handoff não tem nenhum
 * seletor no header compartilhado). O kicker/título "Painel geral/
 * Olá, {nome}" saiu daqui para o Header — antes duplicava o mesmo
 * texto que o Header passou a mostrar.
 *
 * Os blocos novos vêm primeiro, na ordem do handoff `Home v2`: a demanda
 * atual contra a contratada (`DemandSection`, só no Grupo A), o consumo de
 * hoje (`TodayConsumptionSection`) e o peso de cada medidor
 * (`AreaWeightSection`), lado a lado numa grade, e a meta de consumo
 * (`GoalSection`). Os blocos que o Painel já
 * tinha descem e seguem abaixo, divergência deliberada do design v2, que não
 * os desenha.
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
                        <PropertyBlocks
                            propertyId={selectedId}
                            propertyName={selectedProperty.name}
                            isGroupA={selectedProperty.tariffGroup === "GROUP_A"}
                        />
                    )}
                    <PropertyComparisonSection properties={properties} />
                </>
            )}
        </div>
    )
}

// Subcomponentes locais

interface PropertyBlocksProps {
    propertyId: string
    propertyName: string
    isGroupA: boolean
}

/** Blocos escopados à propriedade selecionada, na ordem em que aparecem no Painel. */
const PropertyBlocks = ({ propertyId, propertyName, isGroupA }: PropertyBlocksProps) => (
    <>
        {isGroupA && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-4">
                <DemandSection propertyId={propertyId} propertyName={propertyName} />
            </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-4">
            <TodayConsumptionSection propertyId={propertyId} propertyName={propertyName} />
            <AreaWeightSection
                key={propertyId}
                propertyId={propertyId}
                propertyName={propertyName}
            />
        </div>
        <GoalSection propertyId={propertyId} propertyName={propertyName} />
        <RealtimeSection propertyId={propertyId} propertyName={propertyName} />
        <ConsumptionHistorySection propertyId={propertyId} propertyName={propertyName} />
    </>
)

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
