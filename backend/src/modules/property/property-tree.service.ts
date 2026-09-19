import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { AreaRepository } from "@/modules/area/area.repository.js"
import type { DeviceRepository } from "@/modules/device/device.repository.js"

/** Teto padrão de imóveis por árvore — defesa contra resposta sem limite. */
export const TREE_MAX_PROPERTIES = 100

/** Dispositivo na árvore de cadastro. */
export type PropertyTreeDevice = { id: string; name: string; powerWatts: number | null }

/** Área na árvore de cadastro, com seus dispositivos. */
export type PropertyTreeArea = { id: string; name: string; devices: PropertyTreeDevice[] }

/** Imóvel na árvore de cadastro, com suas áreas. */
export type PropertyTreeProperty = { id: string; name: string; areas: PropertyTreeArea[] }

/** Árvore de cadastro do usuário. `total` é o número real de imóveis, mesmo quando `items` foi limitado pelo teto. */
export type PropertyTree = { items: PropertyTreeProperty[]; total: number }

/**
 * Leitura agregada Imóvel → Área → Dispositivo do usuário — alimenta a tela
 * de cadastro numa única requisição, em vez de uma consulta por nível e por
 * item. Lê os repositories de área e dispositivo diretamente (ADR-0016).
 *
 * A posse é garantida pela construção: tudo parte dos imóveis do próprio
 * usuário, e áreas e dispositivos cujos pais não estão entre eles são
 * descartados. Devolve só id, nome e potência — nunca endereço.
 */
export class PropertyTreeService {
    /**
     * @param propertyRepository - Raízes da árvore (imóveis do usuário).
     * @param areaRepository - Áreas de todos os imóveis do usuário.
     * @param deviceRepository - Dispositivos de todas as áreas do usuário.
     * @param maxProperties - Teto de imóveis na resposta.
     */
    constructor(
        private readonly propertyRepository: PropertyRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly maxProperties: number = TREE_MAX_PROPERTIES,
    ) {}

    /**
     * Monta a árvore de cadastro do usuário, cada nível ordenado por nome.
     *
     * @param userId - Id do usuário autenticado.
     * @returns Os imóveis (até o teto) com áreas e dispositivos, e o total real de imóveis.
     */
    async findTree(userId: string): Promise<PropertyTree> {
        const [roots, areas, devices] = await Promise.all([
            this.propertyRepository.findTreeRootsByUser(userId, this.maxProperties),
            this.areaRepository.findAllByUser(userId),
            this.deviceRepository.findAllByUser(userId),
        ])

        const devicesByArea = groupBy(devices, (device) => device.areaId)
        const areasByProperty = groupBy(areas, (area) => area.propertyId)

        const items = roots.items.map((property): PropertyTreeProperty => ({
            id: property.id,
            name: property.name,
            areas: (areasByProperty.get(property.id) ?? []).map((area): PropertyTreeArea => ({
                id: area.id,
                name: area.name,
                devices: (devicesByArea.get(area.id) ?? []).map((device): PropertyTreeDevice => ({
                    id: device.id,
                    name: device.name,
                    powerWatts: device.powerWatts,
                })),
            })),
        }))

        return { items, total: roots.total }
    }
}

// Preserva a ordem de entrada — os repositories já devolvem por nome.
function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>()
    for (const row of rows) {
        const bucket = groups.get(key(row))
        if (bucket) bucket.push(row)
        else groups.set(key(row), [row])
    }
    return groups
}
