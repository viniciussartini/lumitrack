import { prismaTest } from "@/shared/test/prisma-test.js"

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
        // — de propósito, pra sobreviver à exclusão da conta (#08, #143).
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
}
