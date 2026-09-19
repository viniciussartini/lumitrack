import { useId, useState } from "react"
import { AlertCircle, Cpu, Home, LayoutGrid, Plus, type LucideIcon } from "lucide-react"
import { AreaCreateDialog } from "@/components/area/AreaCreateDialog"
import { DeviceCreateDialog } from "@/components/device/DeviceCreateDialog"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { RegistrationTree } from "@/components/settings/RegistrationTree"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { useProperties } from "@/hooks/queries/useProperties"
import { MAX_PAGE_SIZE } from "@/types/pagination.types"

type OpenDialog = "property" | "area" | "device" | null

interface RegistrationCardProps {
    icon: LucideIcon
    title: string
    description: string
    actionLabel: string
    onAction: () => void
    disabled?: boolean
    /** Id do texto que explica por que a ação está desabilitada. */
    describedBy?: string
}

const RegistrationCard = ({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    disabled = false,
    describedBy,
}: RegistrationCardProps) => (
    <Blueprint className="p-22px flex flex-col items-start gap-3.5">
        <span className="border-accent text-accent h-46px w-46px flex items-center justify-center border">
            <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h3 className="font-heading text-19 m-0 font-semibold uppercase">{title}</h3>
        <p className="text-muted text-13-5 m-0 leading-relaxed">{description}</p>
        <Button
            type="button"
            variant="secondary"
            onClick={onAction}
            disabled={disabled}
            aria-describedby={disabled ? describedBy : undefined}
            className="mt-0.5 gap-2"
        >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            {actionLabel}
        </Button>
    </Blueprint>
)

interface RegistrationCardsProps {
    /** Área e Dispositivo só podem ser criados quando há ao menos uma propriedade. */
    canCreateChildren: boolean
    hintId: string
    onOpen: (dialog: Exclude<OpenDialog, null>) => void
}

const RegistrationCards = ({ canCreateChildren, hintId, onOpen }: RegistrationCardsProps) => (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[clamp(14px,1.6vw,20px)]">
        <RegistrationCard
            icon={Home}
            title="Propriedade"
            description="Endereço, distribuidora, sistema elétrico e classe de faturamento."
            actionLabel="Nova propriedade"
            onAction={() => onOpen("property")}
        />
        <RegistrationCard
            icon={LayoutGrid}
            title="Área"
            description="Agrupamento interno de uma propriedade: salão, produção, quartos."
            actionLabel="Nova área"
            onAction={() => onOpen("area")}
            disabled={!canCreateChildren}
            describedBy={hintId}
        />
        <RegistrationCard
            icon={Cpu}
            title="Dispositivo"
            description="Equipamento medido dentro de uma área, com marca, modelo e potência."
            actionLabel="Novo dispositivo"
            onAction={() => onOpen("device")}
            disabled={!canCreateChildren}
            describedBy={hintId}
        />
    </div>
)

const LoadError = ({ onRetry }: { onRetry: () => void }) => (
    <div
        role="alert"
        className="border-status-danger/40 flex flex-wrap items-center justify-between gap-3 border p-4"
    >
        <p className="text-status-danger m-0 text-sm">Não foi possível carregar as propriedades.</p>
        <Button variant="secondary" onClick={onRetry}>
            Tentar novamente
        </Button>
    </div>
)

/**
 * Configurações → Cadastro: pontos de entrada para criar Propriedade, Área e
 * Dispositivo. Área e Dispositivo pertencem a uma propriedade, então ficam
 * desabilitados (com a explicação ligada por `aria-describedby`) enquanto não
 * há nenhuma — e também enquanto a lista carrega ou falha, para não abrir um
 * modal sem opções de pai.
 */
export const RegistrationPage = () => {
    const [openDialog, setOpenDialog] = useState<OpenDialog>(null)
    const hintId = useId()
    const propertiesQuery = useProperties(1, MAX_PAGE_SIZE)
    const distributorsQuery = useDistributors(1, MAX_PAGE_SIZE)

    const properties = propertiesQuery.data?.items ?? []
    const hasProperties = properties.length > 0
    const hasNoProperties = propertiesQuery.isSuccess && !hasProperties
    const close = () => setOpenDialog(null)

    return (
        <div className="flex flex-col gap-[clamp(16px,2vw,20px)]">
            <p className="text-text/70 m-0 text-sm leading-relaxed">
                Cadastre a estrutura que será monitorada. Uma propriedade recebe áreas, e cada área
                recebe os dispositivos medidos.
            </p>

            {propertiesQuery.isError && (
                <LoadError onRetry={() => void propertiesQuery.refetch()} />
            )}

            <RegistrationCards
                canCreateChildren={hasProperties}
                hintId={hintId}
                onOpen={setOpenDialog}
            />

            {hasNoProperties && (
                <p id={hintId} className="text-muted m-0 flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Cadastre uma propriedade primeiro — áreas e dispositivos pertencem a uma
                    propriedade.
                </p>
            )}

            <RegistrationTree />

            <PropertyFormDialog
                isOpen={openDialog === "property"}
                onClose={close}
                mode={{ kind: "create" }}
                distributors={distributorsQuery.data?.items ?? []}
                isDistributorsLoading={distributorsQuery.isLoading}
            />
            <AreaCreateDialog
                isOpen={openDialog === "area"}
                onClose={close}
                properties={properties}
            />
            <DeviceCreateDialog
                isOpen={openDialog === "device"}
                onClose={close}
                properties={properties}
            />
        </div>
    )
}
