import { prismaTest } from "@/shared/test/prisma-test.js"
import { resetTariffFlagCacheForTests } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { resetDistributorCacheForTests } from "@/modules/distributor/distributor.repository.js"
import { resetTariffCatalogCacheForTests } from "@/modules/distributor/tariff-catalog.repository.js"

// Apaga todos os dados do banco de teste na ordem correta das dependências.
//   User
//   ├── AuthToken
//   ├── PasswordReset
//   ├── Property (distributorId → catálogo global, sem dono)
//   │   ├── Area
//   │   │   └── Device
//   │   │       └── Meter (targetType DEVICE)
//   │   │           ├── MeterReading
//   │   │           └── Alert
//   │   │               └── AlertTriggerEvent
//   │   └── Meter (targetType AREA ou PROPERTY)
//   └── EnergyDistributor (catálogo global — não pertence a User)
//       ├── TariffEnergyRate
//       └── TariffDemandRate
//
// A regra é: sempre deletar os filhos antes dos pais.
// Deletar User antes de AuthToken causaria violação de foreign key.
// Deletar Property antes de Area idem.
//
// O `$transaction` garante atomicidade: ou todas as deleções acontecem,
// ou nenhuma — nunca deixamos o banco em estado inconsistente.

export async function cleanDatabase(): Promise<void> {
    await prismaTest.$transaction([
        // AuditLog e TariffFlagHistory usam onDelete: SetNull (não Cascade)
        // — de propósito, pra sobreviver à exclusão da conta.
        // Por isso precisam ser limpos explicitamente aqui, não seriam
        // removidos automaticamente pelo delete de User.
        prismaTest.auditLog.deleteMany(),
        prismaTest.tariffFlagHistory.deleteMany(),
        prismaTest.alertTriggerEvent.deleteMany(),
        prismaTest.alert.deleteMany(),
        prismaTest.meterReading.deleteMany(),
        prismaTest.meter.deleteMany(),
        prismaTest.device.deleteMany(),
        prismaTest.area.deleteMany(),
        prismaTest.property.deleteMany(),
        // Catálogo tarifário Grupo A (ADR-0019) — referencia EnergyDistributor
        // com onDelete padrão (RESTRICT), então precisa ser limpo antes dele,
        // senão o deleteMany de EnergyDistributor abaixo viola FK.
        prismaTest.tariffEnergyRate.deleteMany(),
        prismaTest.tariffDemandRate.deleteMany(),
        // Catálogo global — sem dono, mas precisa ser limpo entre testes
        // porque o seed/os testes recriam distribuidoras com CNPJ fixo
        // (@unique).
        prismaTest.energyDistributor.deleteMany(),
        prismaTest.tariffFlagConfig.deleteMany(),
        prismaTest.authToken.deleteMany(),
        prismaTest.passwordReset.deleteMany(),
        prismaTest.mfaBackupCode.deleteMany(),
        prismaTest.user.deleteMany(),
    ])

    // TariffFlagRepository/DistributorRepository cacheiam em nível de módulo
    // — sem isto, o cache de um teste anterior sobreviveria à limpeza do
    // banco e vazaria dado obsoleto para o teste seguinte.
    resetTariffFlagCacheForTests()
    resetDistributorCacheForTests()
    resetTariffCatalogCacheForTests()
}
