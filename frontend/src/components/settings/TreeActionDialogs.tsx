import { useEffect } from "react"
import { toast } from "sonner"
import { AreaFormDialog } from "@/components/area/AreaFormDialog"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useDeleteArea } from "@/hooks/queries/useAreaMutations"
import { useArea } from "@/hooks/queries/useAreas"
import { useDeleteDevice } from "@/hooks/queries/useDeviceMutations"
import { useDevice } from "@/hooks/queries/useDevices"
import { useDistributors } from "@/hooks/queries/useDistributors"
import { useDeleteProperty } from "@/hooks/queries/usePropertyMutations"
import { useProperty } from "@/hooks/queries/useProperties"
import { extractErrorMessage } from "@/services/api"
import { MAX_PAGE_SIZE } from "@/types/pagination.types"

/** Item da árvore sobre o qual o usuário agiu, com os ids de que a API precisa. */
export type TreeTarget =
    | { kind: "property"; id: string; name: string }
    | { kind: "area"; propertyId: string; id: string; name: string }
    | { kind: "device"; propertyId: string; areaId: string; id: string; name: string }

export interface TreeAction {
    type: "edit" | "delete"
    target: TreeTarget
}

interface TreeActionDialogsProps {
    /** Ação em curso; `null` quando nenhum modal deve estar aberto. */
    action: TreeAction | null
    onClose: () => void
}

interface TargetDialogProps<T extends TreeTarget = TreeTarget> {
    target: T
    onClose: () => void
}

const NOUN: Record<TreeTarget["kind"], string> = {
    property: "propriedade",
    area: "área",
    device: "dispositivo",
}

// O que a exclusão leva junto — o aviso é a única chance do usuário ver o
// impacto antes de confirmar.
const CASCADE: Record<TreeTarget["kind"], string> = {
    property: "também removerá áreas e dispositivos vinculados",
    area: "também removerá todos os dispositivos, registros de consumo e alertas vinculados",
    device: "também removerá todos os registros de consumo, alertas e configurações de integração IoT vinculados",
}

/** Avisa e fecha o modal quando os dados necessários à edição não carregam. */
const useLoadFailureNotice = (isError: boolean, noun: string, onClose: () => void) => {
    useEffect(() => {
        if (!isError) return
        toast.error(`Não foi possível carregar ${noun} para edição`)
        onClose()
    }, [isError, noun, onClose])
}

const EditPropertyDialog = ({ target, onClose }: TargetDialogProps) => {
    const propertyQuery = useProperty(target.id)
    const distributorsQuery = useDistributors(1, MAX_PAGE_SIZE)
    useLoadFailureNotice(propertyQuery.isError, "a propriedade", onClose)

    if (!propertyQuery.data) return null
    return (
        <PropertyFormDialog
            isOpen
            onClose={onClose}
            mode={{ kind: "edit", property: propertyQuery.data }}
            distributors={distributorsQuery.data?.items ?? []}
            isDistributorsLoading={distributorsQuery.isLoading}
        />
    )
}

const EditAreaDialog = ({
    target,
    onClose,
}: TargetDialogProps<Extract<TreeTarget, { kind: "area" }>>) => {
    const areaQuery = useArea(target.propertyId, target.id)
    useLoadFailureNotice(areaQuery.isError, "a área", onClose)

    if (!areaQuery.data) return null
    return (
        <AreaFormDialog
            isOpen
            onClose={onClose}
            mode={{ kind: "edit", propertyId: target.propertyId, area: areaQuery.data }}
        />
    )
}

const EditDeviceDialog = ({
    target,
    onClose,
}: TargetDialogProps<Extract<TreeTarget, { kind: "device" }>>) => {
    const deviceQuery = useDevice(target.propertyId, target.areaId, target.id)
    useLoadFailureNotice(deviceQuery.isError, "o dispositivo", onClose)

    if (!deviceQuery.data) return null
    return (
        <DeviceFormDialog
            isOpen
            onClose={onClose}
            mode={{
                kind: "edit",
                propertyId: target.propertyId,
                areaId: target.areaId,
                device: deviceQuery.data,
            }}
        />
    )
}

const DeleteTargetDialog = ({ target, onClose }: TargetDialogProps) => {
    const deleteProperty = useDeleteProperty()
    const deleteArea = useDeleteArea()
    const deleteDevice = useDeleteDevice()

    const noun = NOUN[target.kind]
    const isPending = deleteProperty.isPending || deleteArea.isPending || deleteDevice.isPending

    const handleConfirm = () => {
        const options = {
            onSuccess: onClose,
            onError: (error: Error) => {
                toast.error(`Erro ao excluir ${noun}`, { description: extractErrorMessage(error) })
            },
        }
        if (target.kind === "property") {
            deleteProperty.mutate(target.id, options)
        } else if (target.kind === "area") {
            deleteArea.mutate({ propertyId: target.propertyId, areaId: target.id }, options)
        } else {
            deleteDevice.mutate(
                { propertyId: target.propertyId, areaId: target.areaId, deviceId: target.id },
                options,
            )
        }
    }

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
            title={`Excluir ${noun}`}
            description={`Tem certeza que deseja excluir "${target.name}"? Esta ação não pode ser desfeita e ${CASCADE[target.kind]}.`}
            confirmLabel="Excluir"
            isLoading={isPending}
            onConfirm={handleConfirm}
        />
    )
}

/**
 * Modais das ações por linha da árvore de cadastro. Editar carrega a entidade
 * inteira pelo id (a árvore só traz id e nome) e abre o formulário existente;
 * excluir pede confirmação avisando da cascata.
 */
export const TreeActionDialogs = ({ action, onClose }: TreeActionDialogsProps) => {
    if (!action) return null

    if (action.type === "delete") {
        return <DeleteTargetDialog target={action.target} onClose={onClose} />
    }
    const { target } = action
    if (target.kind === "property") return <EditPropertyDialog target={target} onClose={onClose} />
    if (target.kind === "area") return <EditAreaDialog target={target} onClose={onClose} />
    return <EditDeviceDialog target={target} onClose={onClose} />
}
