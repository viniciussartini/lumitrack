import { useId, useState } from "react"
import { AlertCircle, Cpu, Home, LayoutGrid, Plus, type LucideIcon } from "lucide-react"
import { AreaCreateDialog } from "@/components/area/AreaCreateDialog"
import { DeviceCreateDialog } from "@/components/device/DeviceCreateDialog"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { RegistrationTree } from "@/components/settings/RegistrationTree"
import { Blueprint } from "@/components/ui/Blueprint"
import { Button } from "@/components/ui/Button"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
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
    /** Id do texto que explica por que Área e Dispositivo estão indisponíveis, se houver. */
    hintId: string | undefined
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

/**
 * Explicação de por que Área e Dispositivo estão indisponíveis, ou `null`
 * quando não há o que explicar — inclusive enquanto a árvore carrega, um
 * estado passageiro que não pede texto.
 */
const resolveHint = (isError: boolean, hasLoadedNoProperties: boolean): string | null => {
    if (isError) {
        return "Áreas e dispositivos ficam indisponíveis até a estrutura cadastrada carregar."
    }
    if (hasLoadedNoProperties) {
        return "Cadastre uma propriedade primeiro — áreas e dispositivos pertencem a uma propriedade."
    }
    return null
}

/**
 * Configurações → Cadastro: pontos de entrada para criar Propriedade, Área e
 * Dispositivo. Área e Dispositivo pertencem a uma propriedade, então ficam
 * desabilitados — enquanto a estrutura carrega, se falha ou se está vazia — para
 * não abrir um modal sem opções de pai. A explicação, quando existe, é ligada
 * aos botões por `aria-describedby`. Os seletores de pai dos modais usam a
 * mesma árvore que a lista "Estrutura cadastrada" mostra (uma só fonte, sem
 * corte diferente entre a lista e os seletores).
 */
export const RegistrationPage = () => {
    const [openDialog, setOpenDialog] = useState<OpenDialog>(null)
    const hintId = useId()
    const treeQuery = usePropertyTree()
    const distributorsQuery = useDistributors(1, MAX_PAGE_SIZE)

    const properties = treeQuery.data?.items ?? []
    const hasProperties = properties.length > 0
    const hint = resolveHint(treeQuery.isError, treeQuery.isSuccess && !hasProperties)
    const close = () => setOpenDialog(null)

    return (
        <div className="flex flex-col gap-[clamp(16px,2vw,20px)]">
            <p className="text-text/70 m-0 text-sm leading-relaxed">
                Cadastre a estrutura que será monitorada. Uma propriedade recebe áreas, e cada área
                recebe os dispositivos medidos.
            </p>

            <RegistrationCards
                canCreateChildren={hasProperties}
                hintId={hint ? hintId : undefined}
                onOpen={setOpenDialog}
            />

            {hint && (
                <p id={hintId} className="text-muted m-0 flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {hint}
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
