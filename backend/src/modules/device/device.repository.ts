import { PrismaClient } from "@/generated/prisma/client.js"
import type { CreateDeviceInput, UpdateDeviceInput } from "@/modules/device/device.schema.js"
import { toSkipTake, type Paginated, type PaginationQuery } from "@/shared/pagination.js"
import {
    toPropertyResponse,
    type PropertyResponse,
} from "@/modules/property/property.repository.js"
import type { AreaResponse } from "@/modules/area/area.repository.js"

type PrismaDevice = NonNullable<Awaited<ReturnType<PrismaClient["device"]["findUnique"]>>>

export type DeviceResponse = PrismaDevice

/** Acesso a dispositivos persistidos — CRUD e leituras compostas com área/propriedade. */
export class DeviceRepository {
    /** @param prisma - Cliente Prisma usado para todas as operações de dispositivo. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Busca um dispositivo pelo id, sem carregar a cadeia de posse.
     *
     * @param id - Id do dispositivo.
     * @returns O dispositivo, ou `null` se não existir.
     */
    async findById(id: string): Promise<DeviceResponse | null> {
        return this.prisma.device.findUnique({ where: { id } })
    }

    /**
     * Resolve device + área + propriedade dona numa única query (`include`
     * aninhado), em vez dos 3 round trips sequenciais que `resolveRootProperty`
     * fazia antes — `relationLoadStrategy: "join"` força um SQL JOIN real (a
     * estratégia default do Prisma para `include` é executar uma query por
     * nível de relação, não um join, mesmo aninhado). `Device.areaId` e
     * `Area.propertyId` são FKs obrigatórias, então a única falha possível
     * aqui é o próprio device não existir.
     *
     * @param id - Id do dispositivo.
     * @returns Device, área e propriedade, ou `null` se o device não existir.
     */
    async findByIdWithProperty(
        id: string,
    ): Promise<{ device: DeviceResponse; area: AreaResponse; property: PropertyResponse } | null> {
        const raw = await this.prisma.device.findUnique({
            where: { id },
            include: { area: { include: { property: true } } },
            relationLoadStrategy: "join",
        })
        if (!raw) return null

        const { area: rawArea, ...device } = raw
        const { property, ...area } = rawArea
        return { device, area, property: toPropertyResponse(property) }
    }

    /**
     * Lista completa (sem paginação) dos dispositivos de uma área.
     *
     * @param areaId - Id da área dona dos dispositivos.
     * @returns Dispositivos da área, ordenados por nome.
     */
    async findAllByArea(areaId: string): Promise<DeviceResponse[]> {
        return this.prisma.device.findMany({
            where: { areaId },
            orderBy: { name: "asc" },
        })
    }

    /**
     * Lista paginada dos dispositivos de uma área.
     *
     * @param areaId - Id da área dona dos dispositivos.
     * @param pagination - Página e tamanho de página.
     * @returns Página de dispositivos e o total na área.
     */
    async findAllByAreaPaginated(
        areaId: string,
        pagination: PaginationQuery,
    ): Promise<Paginated<DeviceResponse>> {
        const { skip, take } = toSkipTake(pagination)

        const [devices, total] = await Promise.all([
            this.prisma.device.findMany({
                where: { areaId },
                orderBy: { name: "asc" },
                skip,
                take,
            }),
            this.prisma.device.count({ where: { areaId } }),
        ])

        return { items: devices, total, page: pagination.page, pageSize: pagination.pageSize }
    }

    /**
     * Usado pela exportação de dados do titular — filtro de relação
     * aninhada de 2 níveis (Device → Area → Property → User).
     *
     * @param userId - Id do usuário dono, via cadeia área → propriedade.
     * @returns Todos os dispositivos do usuário, ordenados por nome.
     */
    async findAllByUser(userId: string): Promise<DeviceResponse[]> {
        return this.prisma.device.findMany({
            where: { area: { property: { userId } } },
            orderBy: { name: "asc" },
        })
    }

    /**
     * Cria um dispositivo vinculado à área informada.
     *
     * @param areaId - Id da área dona do novo dispositivo.
     * @param data - Dados já validados do dispositivo.
     * @returns O dispositivo criado.
     */
    async create(areaId: string, data: CreateDeviceInput): Promise<DeviceResponse> {
        return this.prisma.device.create({
            data: {
                areaId,
                name: data.name,
                brand: data.brand ?? null,
                model: data.model ?? null,
                powerWatts: data.powerWatts ?? null,
            },
        })
    }

    /**
     * Atualiza parcialmente um dispositivo, ignorando campos `undefined`
     * do payload (para não sobrescrever valores já persistidos com vazio).
     *
     * @param id - Id do dispositivo a atualizar.
     * @param data - Campos já validados a atualizar.
     * @returns O dispositivo atualizado.
     */
    async update(id: string, data: UpdateDeviceInput): Promise<DeviceResponse> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
        )

        return this.prisma.device.update({
            where: { id },
            data: cleanData,
        })
    }

    /**
     * Remove um dispositivo definitivamente.
     *
     * @param id - Id do dispositivo a remover.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.device.delete({ where: { id } })
    }
}
