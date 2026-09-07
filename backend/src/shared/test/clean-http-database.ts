import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"

// Apaga todos os dados do banco lumitrack_test_http na ordem correta
// das dependências — filhos antes dos pais, para não violar foreign keys.
// Usado no beforeEach dos testes de integração HTTP. Ver clean-database.ts
// para o diagrama da hierarquia.

export async function cleanHttpDatabase(): Promise<void> {
    await prismaHttpTest.$transaction([
        // AuditLog e TariffFlagHistory usam onDelete: SetNull (não Cascade)
        // — de propósito, pra sobreviver à exclusão da conta.
        // Por isso precisam ser limpos explicitamente, não seriam removidos
        // automaticamente pelo delete de User.
        prismaHttpTest.auditLog.deleteMany(),
        prismaHttpTest.tariffFlagHistory.deleteMany(),
        prismaHttpTest.alertTriggerEvent.deleteMany(),
        prismaHttpTest.alert.deleteMany(),
        prismaHttpTest.meterReading.deleteMany(),
        prismaHttpTest.meter.deleteMany(),
        prismaHttpTest.device.deleteMany(),
        prismaHttpTest.area.deleteMany(),
        prismaHttpTest.property.deleteMany(),
        // Catálogo tarifário Grupo A (ADR-0019) — referencia EnergyDistributor
        // com onDelete padrão (RESTRICT), precisa ser limpo antes dele.
        prismaHttpTest.tariffEnergyRate.deleteMany(),
        prismaHttpTest.tariffDemandRate.deleteMany(),
        prismaHttpTest.energyDistributor.deleteMany(),
        prismaHttpTest.tariffFlagConfig.deleteMany(),
        prismaHttpTest.authToken.deleteMany(),
        prismaHttpTest.passwordReset.deleteMany(),
        prismaHttpTest.mfaBackupCode.deleteMany(),
        prismaHttpTest.user.deleteMany(),
    ])
}
