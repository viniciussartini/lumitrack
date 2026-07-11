import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"

// Apaga todos os dados do banco lumitrack_test_http na ordem correta
// das dependências — filhos antes dos pais, para não violar foreign keys.
// Usado no beforeEach dos testes de integração HTTP. Ver clean-database.ts
// para o diagrama da hierarquia.

export async function cleanHttpDatabase(): Promise<void> {
    await prismaHttpTest.$transaction([
        // AuditLog usa onDelete: SetNull (não Cascade) — de propósito, pra
        // sobreviver à exclusão da conta (#08). Por isso precisa ser limpo
        // explicitamente, não seria removido automaticamente pelo delete de User.
        prismaHttpTest.auditLog.deleteMany(),
        prismaHttpTest.alertTriggerEvent.deleteMany(),
        prismaHttpTest.alert.deleteMany(),
        prismaHttpTest.meterReading.deleteMany(),
        prismaHttpTest.meter.deleteMany(),
        prismaHttpTest.device.deleteMany(),
        prismaHttpTest.area.deleteMany(),
        prismaHttpTest.property.deleteMany(),
        prismaHttpTest.energyDistributor.deleteMany(),
        prismaHttpTest.tariffFlagConfig.deleteMany(),
        prismaHttpTest.authToken.deleteMany(),
        prismaHttpTest.passwordReset.deleteMany(),
        prismaHttpTest.mfaBackupCode.deleteMany(),
        prismaHttpTest.user.deleteMany(),
    ])
}