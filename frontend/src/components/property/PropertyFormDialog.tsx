import { Link } from "react-router"
import { Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
import { FormDialog } from "@/components/ui/FormDialog"
import { PropertyForm } from "@/components/property/PropertyForm"
import { useCreateProperty, useUpdateProperty } from "@/hooks/queries/usePropertyMutations"
import { useCurrentAclContract } from "@/hooks/queries/useAclContracts"
import { useCreateAclContract, useUpdateAclContract } from "@/hooks/queries/useAclContractMutations"
import { extractErrorMessage } from "@/services/api"
import type { PropertyFormData } from "@/schemas/property.schema"
import type { CreatePropertyInput, Property, UpdatePropertyInput } from "@/types/property.types"
import type { CreateAclContractInput, UpdateAclContractInput } from "@/types/acl-contract.types"
import type { Distributor } from "@/types/distributor.types"

type DialogMode = { kind: "create" } | { kind: "edit"; property: Property }

// Extraídos do componente — mesmo corte de `resolveTariffGroupFields` no
// backend, aqui só pra caber no teto de linhas/complexidade do arquivo.

const buildCreateInput = (data: PropertyFormData): CreatePropertyInput => ({
    distributorId: data.distributorId,
    name: data.name,
    electricalSystem: data.electricalSystem,
    tariffGroup: data.tariffGroup,
    contractingEnvironment: data.contractingEnvironment,
    ...(data.address !== undefined && { address: data.address }),
    ...(data.city !== undefined && { city: data.city }),
    ...(data.state !== undefined && { state: data.state }),
    ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
    ...(data.billingClass !== undefined && { billingClass: data.billingClass }),
    ...(data.tariffSubgroup !== undefined && { tariffSubgroup: data.tariffSubgroup }),
    ...(data.tariffModality !== undefined && { tariffModality: data.tariffModality }),
    ...(data.contractedDemandKw !== undefined && {
        contractedDemandKw: data.contractedDemandKw,
    }),
    ...(data.publicLightingFeeBrl !== undefined && {
        publicLightingFeeBrl: data.publicLightingFeeBrl,
    }),
})

const buildUpdateInput = (data: PropertyFormData): UpdatePropertyInput => ({
    distributorId: data.distributorId,
    name: data.name,
    address: data.address,
    city: data.city,
    state: data.state,
    zipCode: data.zipCode,
    electricalSystem: data.electricalSystem,
    tariffGroup: data.tariffGroup,
    billingClass: data.billingClass,
    tariffSubgroup: data.tariffSubgroup,
    tariffModality: data.tariffModality,
    contractedDemandKw: data.contractedDemandKw,
    publicLightingFeeBrl: data.publicLightingFeeBrl,
    contractingEnvironment: data.contractingEnvironment,
})

/**
 * Primeiro dia do mês corrente, em hora local — não `new Date().toISOString()`
 * (que travaria no dia de hoje). O backend resolve o contrato vigente de um
 * mês comparando `validFrom` com o primeiro dia daquele mês
 * (`ConsumptionService.resolveAclContractForMonth`); um contrato criado no
 * meio do mês com `validFrom` = hoje nunca cobriria o próprio mês em que foi
 * criado, derrubando a conta desse mês e a comparação ACR × ACL até o mês
 * seguinte começar.
 */
const firstDayOfCurrentMonth = (): string => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

/**
 * Corpo do contrato ACL a partir dos campos `acl*` do form — só chamado
 * quando `data.contractingEnvironment === "ACL"` (o schema garante que os 5
 * campos estão presentes nesse caso). `validFrom` não vem do form (o
 * handoff de design não modela essa data aqui) — a criação usa o primeiro
 * dia do mês corrente; a atualização não a reenvia, preservando a vigência
 * já registrada.
 */
const buildAclContractCreateInput = (
    data: PropertyFormData,
    propertyId: string,
): CreateAclContractInput => ({
    propertyId,
    retailerName: data.aclRetailerName!,
    submarket: data.aclSubmarket!,
    energySource: data.aclEnergySource!,
    energyPricePerMwh: data.aclEnergyPricePerMwh!,
    contractedVolumeMwh: data.aclContractedVolumeMwh!,
    validFrom: firstDayOfCurrentMonth(),
})

const buildAclContractUpdateInput = (data: PropertyFormData): UpdateAclContractInput => ({
    retailerName: data.aclRetailerName,
    submarket: data.aclSubmarket,
    energySource: data.aclEnergySource,
    energyPricePerMwh: data.aclEnergyPricePerMwh,
    contractedVolumeMwh: data.aclContractedVolumeMwh,
})

/** Textos do header do modal — extraído só pra caber no teto de complexidade do componente. */
const resolveDialogCopy = (mode: DialogMode): { kicker: string; title: string } =>
    mode.kind === "create"
        ? { kicker: "Nova propriedade", title: "Adicionar propriedade" }
        : { kicker: "Propriedade", title: "Editar propriedade" }

interface FormVisibility {
    isLoadingCatalog: boolean
    isCreatingWithoutCatalog: boolean
    isLoadingAclContract: boolean
    loadingLabel: string
    showForm: boolean
}

/**
 * Guards de renderização do form — extraído só pra caber no teto de
 * complexidade do componente (a lógica em si não mudou).
 *
 * `isLoadingAclContract` espera o contrato ACL corrente resolver antes de
 * montar o form: RHF captura `defaultValues` só na primeira renderização
 * (`useForm` não reage a mudanças posteriores em `initialAclContract`) —
 * sem este guard, o contrato chegaria depois do form já montado e os
 * campos ficariam em branco até o modal reabrir. Sempre `false` fora de
 * edição de uma propriedade ACL (a query nem dispara — `enabled: false`).
 */
const resolveFormVisibility = (
    mode: DialogMode,
    isDistributorsLoading: boolean,
    hasDistributors: boolean,
    isLoadingAclContract: boolean,
): FormVisibility => {
    const isLoadingCatalog = mode.kind === "create" && isDistributorsLoading
    const isCreatingWithoutCatalog =
        mode.kind === "create" && !isDistributorsLoading && !hasDistributors
    return {
        isLoadingCatalog,
        isCreatingWithoutCatalog,
        isLoadingAclContract,
        loadingLabel: isLoadingCatalog ? "Carregando distribuidoras" : "Carregando contrato ACL",
        showForm: !isLoadingCatalog && !isCreatingWithoutCatalog && !isLoadingAclContract,
    }
}

/**
 * Orquestração de submit — extraída do componente (teto de linhas) num hook
 * próprio, mesmo padrão de `usePropertyMutations`: o componente só chama e
 * renderiza, a sequência de mutations fica aqui.
 *
 * Cria/atualiza a propriedade primeiro e só depois o contrato ACL — o
 * backend exige a propriedade já marcada ACL para aceitar um contrato
 * (`AclContractService.assertPropertyAcceptsAclContract`). Sem contrato
 * prévio (criação, ou edição de uma propriedade que ainda não tinha um),
 * cria; havendo um, atualiza o mesmo em vez de duplicar.
 */
const usePropertyFormSubmit = (mode: DialogMode, onClose: () => void, isOpen: boolean) => {
    const createProperty = useCreateProperty()
    const updateProperty = useUpdateProperty()
    const createAclContract = useCreateAclContract()
    const updateAclContract = useUpdateAclContract()
    // Busca o contrato corrente em qualquer edição, não só de propriedade
    // hoje em ACL — uma propriedade pode ter voltado pro cativo (ACR) e
    // ainda ter um contrato antigo cadastrado (o modelo permite: só a
    // CRIAÇÃO de contrato novo exige a propriedade já em ACL, nada apaga um
    // contrato existente ao trocar de ambiente). Sem esta busca, reativar
    // ACL numa propriedade assim criaria um segundo contrato sobreposto em
    // vez de atualizar o que já existe. Criação (sem id ainda) deixa a
    // query desabilitada — não há contrato pra buscar. `isOpen` também
    // entra na condição: o componente fica montado (só oculto) na página
    // de detalhes o tempo todo, então sem este guard a busca disparia a
    // cada visita à página, não só ao abrir o modal de edição.
    const currentAclContractQuery = useCurrentAclContract(
        isOpen && mode.kind === "edit" ? mode.property.id : undefined,
    )

    const syncAclContract = async (data: PropertyFormData, propertyId: string) => {
        if (data.contractingEnvironment !== "ACL") return

        if (currentAclContractQuery.data) {
            await updateAclContract.mutateAsync({
                id: currentAclContractQuery.data.id,
                propertyId,
                input: buildAclContractUpdateInput(data),
            })
            return
        }
        await createAclContract.mutateAsync(buildAclContractCreateInput(data, propertyId))
    }

    const handleSubmit = async (data: PropertyFormData) => {
        const isCreate = mode.kind === "create"
        let propertyId: string
        try {
            propertyId = isCreate
                ? (await createProperty.mutateAsync(buildCreateInput(data))).id
                : (
                      await updateProperty.mutateAsync({
                          id: mode.property.id,
                          input: buildUpdateInput(data),
                      })
                  ).id
        } catch (error) {
            toast.error(isCreate ? "Erro ao criar propriedade" : "Erro ao atualizar propriedade", {
                description: extractErrorMessage(error),
            })
            return
        }

        // Propriedade já salva com sucesso a esta altura — fecha o modal já
        // aqui, antes de tentar o contrato ACL: se o passo seguinte falhar,
        // reabrir o mesmo modal em modo "create" recriaria a propriedade do
        // zero (duplicata) em vez de só reenviar o contrato. Uma falha do
        // contrato vira toast próprio; o usuário corrige reabrindo em modo
        // "edit" (que atualiza a propriedade já existente e só cria o
        // contrato que ainda falta).
        onClose()

        try {
            await syncAclContract(data, propertyId)
        } catch (error) {
            toast.error("Propriedade salva, mas o contrato ACL não foi salvo", {
                description: extractErrorMessage(error),
            })
        }
    }

    return { currentAclContractQuery, handleSubmit }
}

interface PropertyFormDialogProps {
    isOpen: boolean
    onClose: () => void
    mode: DialogMode
    /** Catálogo de distribuidoras pro select — carregado pela página chamadora. */
    distributors: Distributor[]
    /**
     * Só relevante no modo "create" — enquanto a query de distribuidoras da
     * página chamadora ainda não resolveu, `distributors` chega vazio por
     * estar carregando, não por estar vazio de verdade. Sem essa distinção,
     * o guard de catálogo vazio (abaixo) apareceria num falso-positivo se o
     * usuário abrir o modal antes da query resolver. Default `false` — os
     * demais consumidores (edição) nunca usam o branch que depende disso.
     */
    isDistributorsLoading?: boolean
}

/**
 * Dialog (Radix, via FormDialog) que envolve o PropertyForm e orquestra
 * create/update. Mesmo padrão de MeterFormDialog: o form é puro, o dialog
 * resolve qual mutation chamar e traduz erro pra toast.
 *
 * O protótipo (LumiTrack Home.dc.html) só especifica o modo "editar" pra
 * propriedade — o modo "criar" segue o mesmo padrão de texto que ele usa
 * pra Área/Dispositivo (kicker "Nova X" / título "Adicionar X" / "Criar X").
 *
 * Toda propriedade precisa de uma distribuidora vinculada — sem nenhuma
 * cadastrada no catálogo, o form (modo "create") não renderiza; mostra um
 * guard orientando a cadastrar uma primeiro. Texto recuperado literalmente
 * da antiga `NewPropertyPage` (removida quando a criação virou
 * modal — o guard tinha ficado pra trás). Não é o
 * `EmptyState` genérico porque ele vem com o próprio frame `.blueprint` +
 * cantos — duplicaria a moldura do modal, que já é `.blueprint`.
 */
export const PropertyFormDialog = ({
    isOpen,
    onClose,
    mode,
    distributors,
    isDistributorsLoading = false,
}: PropertyFormDialogProps) => {
    const { currentAclContractQuery, handleSubmit } = usePropertyFormSubmit(mode, onClose, isOpen)

    const {
        isLoadingCatalog,
        isCreatingWithoutCatalog,
        isLoadingAclContract,
        loadingLabel,
        showForm,
    } = resolveFormVisibility(
        mode,
        isDistributorsLoading,
        distributors.length > 0,
        currentAclContractQuery.isLoading,
    )
    const { kicker, title } = resolveDialogCopy(mode)

    return (
        <FormDialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
            kicker={kicker}
            title={title}
        >
            {(isLoadingCatalog || isLoadingAclContract) && (
                <div
                    className="flex justify-center py-10"
                    aria-busy="true"
                    aria-label={loadingLabel}
                >
                    <div className="bg-divider h-6 w-48 animate-pulse" />
                </div>
            )}

            {isCreatingWithoutCatalog && (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <div className="border-divider flex h-14 w-14 items-center justify-center border">
                        <Zap className="text-muted h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h3 className="text-lg">Catálogo de distribuidoras indisponível</h3>
                        <p className="text-muted max-w-md text-sm">
                            Toda propriedade precisa estar vinculada a uma distribuidora do
                            catálogo. Tente novamente em instantes.
                        </p>
                    </div>
                    <Button asChild variant="secondary" className="mt-2">
                        <Link to="/distribuidoras">Ver catálogo de distribuidoras</Link>
                    </Button>
                </div>
            )}

            {showForm && (
                <PropertyForm
                    initialData={mode.kind === "edit" ? mode.property : undefined}
                    initialAclContract={currentAclContractQuery.data}
                    distributors={distributors}
                    onSubmit={handleSubmit}
                    onCancel={onClose}
                    submitLabel={mode.kind === "create" ? "Criar propriedade" : "Salvar alterações"}
                />
            )}
        </FormDialog>
    )
}
