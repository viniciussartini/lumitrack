import type { UserRepository, UserWithoutPassword } from "@/modules/user/user.repository.js"
import type {
    PropertyRepository,
    PropertyResponse,
} from "@/modules/property/property.repository.js"
import type {
    DistributorRepository,
    DistributorResponse,
} from "@/modules/distributor/distributor.repository.js"
import type { AlertRepository, AlertResponse } from "@/modules/alert/alert.repository.js"
import type { AreaRepository, AreaResponse } from "@/modules/area/area.repository.js"
import type { DeviceRepository, DeviceResponse } from "@/modules/device/device.repository.js"
import type { AuditRepository, AuditLogResponse } from "@/shared/audit/audit.repository.js"
import { NotFoundError } from "@/shared/errors/AppError.js"

// Payload agregado com todos os dados pessoais que o LumiTrack guarda sobre
// o titular (Art. 18 LGPD).
//
// O histórico de consumo (antigo `consumptionRecords`, baseado em
// ConsumptionRecord) foi removido daqui — esse modelo não existe mais. A
// exportação de consumo agregado via MeterReading ainda não foi incluída
// aqui, apesar do TariffService já existir — fica para quando entrar no
// escopo do export.
//
// `distributors` não vem de `findAllByUser` — a distribuidora é um
// catálogo global sem dono. Aqui buscamos só as distribuidoras
// efetivamente vinculadas às propriedades do titular (via `findAllByIds`),
// que é a informação que de fato compõe o dado pessoal exportado (a
// propriedade aponta pra elas).
export type DataExportPayload = {
    generatedAt: Date
    user: UserWithoutPassword
    properties: PropertyResponse[]
    distributors: DistributorResponse[]
    areas: AreaResponse[]
    devices: DeviceResponse[]
    alerts: AlertResponse[]
    auditLogs: AuditLogResponse[]
}

export class ExportService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly propertyRepository: PropertyRepository,
        private readonly distributorRepository: DistributorRepository,
        private readonly alertRepository: AlertRepository,
        private readonly areaRepository: AreaRepository,
        private readonly deviceRepository: DeviceRepository,
        private readonly auditRepository: AuditRepository,
    ) {}

    // userId vem sempre do middleware authenticate (GET /api/users/me/data-export,
    // sem :id na URL) — não há checagem de ownership a fazer aqui, cada
    // repositório já filtra nativamente por userId.
    async generate(userId: string): Promise<DataExportPayload> {
        const user = await this.userRepository.findById(userId)
        if (!user) {
            throw new NotFoundError("Usuário não encontrado")
        }

        const [properties, alerts, areas, devices, auditLogs] = await Promise.all([
            this.propertyRepository.findAllByUser(userId),
            this.alertRepository.findAllByUser(userId),
            this.areaRepository.findAllByUser(userId),
            this.deviceRepository.findAllByUser(userId),
            this.auditRepository.findByUserId(userId),
        ])

        const distributorIds = [...new Set(properties.map((p) => p.distributorId))]
        const distributors = await this.distributorRepository.findAllByIds(distributorIds)

        return {
            generatedAt: new Date(),
            user,
            properties,
            distributors,
            areas,
            devices,
            alerts,
            auditLogs,
        }
    }
}
