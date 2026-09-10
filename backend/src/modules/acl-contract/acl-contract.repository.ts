import { PrismaClient } from "@/generated/prisma/client.js"
import type {
    CreateAclContractInput,
    UpdateAclContractInput,
} from "@/modules/acl-contract/acl-contract.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"

type PrismaAclContract = NonNullable<Awaited<ReturnType<PrismaClient["aclContract"]["findUnique"]>>>

// energyPricePerMwh/contractedVolumeMwh são Decimal no Prisma — convertidos
// para number aqui no repository, mesmo padrão usado por Property/TariffCatalog.
export type AclContractResponse = Omit<
    PrismaAclContract,
    "energyPricePerMwh" | "contractedVolumeMwh"
> & {
    energyPricePerMwh: number
    contractedVolumeMwh: number
}

function toAclContractResponse(contract: PrismaAclContract): AclContractResponse {
    return {
        ...contract,
        energyPricePerMwh: contract.energyPricePerMwh.toNumber(),
        contractedVolumeMwh: contract.contractedVolumeMwh.toNumber(),
    }
}

/** Acesso a contratos de energia do Mercado Livre (ACL) persistidos. */
export class AclContractRepository {
    /** @param prisma - Cliente Prisma para a tabela `acl_contracts`. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca um contrato pelo id, sem checagem de ownership.
     *
     * @param id - Id do contrato.
     * @returns O contrato, ou `null` se não existir.
     */
    async findById(id: string): Promise<AclContractResponse | null> {
        const contract = await this.prisma.aclContract.findUnique({ where: { id } })
        return contract && toAclContractResponse(contract)
    }

    /**
     * Lista paginada dos contratos de um usuário, mais recentes primeiro,
     * opcionalmente restrita a uma propriedade.
     *
     * @param userId - Id do usuário dono dos contratos.
     * @param pagination - Parâmetros de paginação já validados.
     * @param propertyId - Quando informado, restringe à propriedade.
     * @returns Página de contratos do usuário.
     */
    async findAllByUserPaginated(
        userId: string,
        pagination: PaginationQuery,
        propertyId?: string,
    ): Promise<Paginated<AclContractResponse>> {
        const { skip, take } = toSkipTake(pagination)
        const where = { userId, ...(propertyId && { propertyId }) }

        const [items, total] = await Promise.all([
            this.prisma.aclContract.findMany({
                where,
                orderBy: { validFrom: "desc" },
                skip,
                take,
            }),
            this.prisma.aclContract.count({ where }),
        ])

        return {
            items: items.map(toAclContractResponse),
            total,
            page: pagination.page,
            pageSize: pagination.pageSize,
        }
    }

    /**
     * Todos os contratos de um usuário, sem paginação — usado pela
     * exportação LGPD (Art. 18), mesmo padrão de `DemandAlertRepository.findAllByUser`.
     *
     * @param userId - Id do usuário dono dos contratos.
     * @returns Todos os contratos do usuário.
     */
    async findAllByUser(userId: string): Promise<AclContractResponse[]> {
        const contracts = await this.prisma.aclContract.findMany({
            where: { userId },
            orderBy: { validFrom: "desc" },
        })
        return contracts.map(toAclContractResponse)
    }

    /**
     * Cria um contrato.
     *
     * @param userId - Id do usuário dono do contrato.
     * @param data - Dados já validados do contrato.
     * @returns O contrato criado.
     */
    async create(userId: string, data: CreateAclContractInput): Promise<AclContractResponse> {
        const contract = await this.prisma.aclContract.create({
            data: {
                userId,
                propertyId: data.propertyId,
                retailerName: data.retailerName,
                submarket: data.submarket,
                energySource: data.energySource,
                energyPricePerMwh: data.energyPricePerMwh,
                contractedVolumeMwh: data.contractedVolumeMwh,
                validFrom: data.validFrom,
                validTo: data.validTo ?? null,
            },
        })
        return toAclContractResponse(contract)
    }

    /**
     * Atualiza um contrato, ignorando campos `undefined` do input.
     *
     * @param id - Id do contrato.
     * @param data - Campos já validados a atualizar.
     * @returns O contrato atualizado.
     */
    async update(id: string, data: UpdateAclContractInput): Promise<AclContractResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )
        const contract = await this.prisma.aclContract.update({ where: { id }, data: cleanData })
        return toAclContractResponse(contract)
    }

    /**
     * Remove um contrato.
     *
     * @param id - Id do contrato.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.aclContract.delete({ where: { id } })
    }
}
