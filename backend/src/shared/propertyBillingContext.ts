import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { DistributorResponse } from "@/modules/distributor/distributor.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import { resolveFlagPer100Kwh } from "@/modules/tariff-flag/tariff-flag.repository.js"
import type { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { ForbiddenError, NotFoundError } from "@/shared/errors/AppError.js"

export interface PropertyBillingContextRepositories {
    propertyRepository: PropertyRepository
    meterRepository: MeterRepository
    distributorRepository: DistributorRepository
    tariffFlagRepository: TariffFlagRepository
}

/** O que é preciso para calcular a conta de uma propriedade do usuário. */
export interface PropertyBillingContext {
    property: PropertyResponse
    /** Id do medidor vinculado à propriedade. */
    meterId: string
    distributor: DistributorResponse
    /** Bandeira tarifária vigente, em R$ por 100 kWh. */
    flagPer100Kwh: number
}

/**
 * Busca uma propriedade e confirma que é do usuário. "Não existe" e "não é
 * sua" são erros distintos (404 e 403) porque o chamador já está autenticado
 * e a rota é escopada ao próprio usuário.
 *
 * @param propertyRepository - Acesso às propriedades.
 * @param propertyId - Id da propriedade.
 * @param userId - Id do usuário autenticado.
 * @returns A propriedade, quando é do usuário.
 */
export async function loadOwnedProperty(
    propertyRepository: PropertyRepository,
    propertyId: string,
    userId: string,
): Promise<PropertyResponse> {
    const property = await propertyRepository.findById(propertyId)
    if (!property) {
        throw new NotFoundError("Propriedade não encontrada")
    }
    if (property.userId !== userId) {
        throw new ForbiddenError("Acesso negado")
    }
    return property
}

/**
 * Busca a distribuidora vinculada à propriedade.
 *
 * @param distributorRepository - Acesso às distribuidoras.
 * @param distributorId - Id da distribuidora.
 * @returns A distribuidora, com as tarifas e a janela de ponta.
 */
export async function requireDistributor(
    distributorRepository: DistributorRepository,
    distributorId: string,
): Promise<DistributorResponse> {
    const distributor = await distributorRepository.findById(distributorId)
    if (!distributor) {
        throw new NotFoundError("Distribuidora vinculada não encontrada")
    }
    return distributor
}

/**
 * Lê a bandeira tarifária vigente.
 *
 * @param tariffFlagRepository - Acesso à configuração de bandeira.
 * @returns O adicional da bandeira, em R$ por 100 kWh.
 */
export async function requireFlagPer100Kwh(
    tariffFlagRepository: TariffFlagRepository,
): Promise<number> {
    const config = await tariffFlagRepository.get()
    if (!config) {
        throw new NotFoundError("Configuração de bandeira tarifária não encontrada")
    }
    return resolveFlagPer100Kwh(config)
}

/**
 * Carrega, nesta ordem, o que as comparações de propriedade precisam: a
 * propriedade do usuário, o medidor, a distribuidora e a bandeira vigente.
 * Cada passo falha fechado com o erro do próprio passo; as verificações
 * específicas de cada chamador entram entre os passos, para a precedência dos
 * erros não depender de qual comparação foi pedida.
 *
 * @param userId - Id do usuário autenticado.
 * @param propertyId - Id da propriedade.
 * @param repositories - Repositórios de propriedade, medidor, distribuidora e bandeira.
 * @param checks - Verificações do chamador: `property` roda logo depois da posse e `distributor` logo depois de achar a distribuidora.
 * @returns A propriedade, o medidor, a distribuidora e a bandeira.
 */
export async function loadOwnedPropertyBillingContext(
    userId: string,
    propertyId: string,
    repositories: PropertyBillingContextRepositories,
    checks: {
        property?: (property: PropertyResponse) => void
        distributor?: (distributor: DistributorResponse) => void
    } = {},
): Promise<PropertyBillingContext> {
    const property = await loadOwnedProperty(repositories.propertyRepository, propertyId, userId)
    checks.property?.(property)

    const meter = await repositories.meterRepository.findByTarget("PROPERTY", propertyId)
    if (!meter) {
        throw new NotFoundError("Esta propriedade não possui medidor vinculado")
    }

    const distributor = await requireDistributor(
        repositories.distributorRepository,
        property.distributorId,
    )
    checks.distributor?.(distributor)

    const flagPer100Kwh = await requireFlagPer100Kwh(repositories.tariffFlagRepository)

    return { property, meterId: meter.id, distributor, flagPer100Kwh }
}
