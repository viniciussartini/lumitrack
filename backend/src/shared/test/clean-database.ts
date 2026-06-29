import { prismaTest } from "@/shared/test/prisma-test.js"

// Apaga todos os dados do banco de teste na ordem correta das dependências.
//   User
//   ├── AuthToken
//   ├── PasswordReset
//   ├── EnergyDistributor
//   │   └── Property
//   │       └── Area
//   │           └── Device
//   │               ├── ConsumptionRecord
//   │               ├── Alert
//   │               └── IoTDeviceConfig
//   └── Alert
//
// A regra é: sempre deletar os filhos antes dos pais.
// Deletar User antes de AuthToken causaria violação de foreign key.
// Deletar Property antes de Area idem.
//
// O `$transaction` garante atomicidade: ou todas as deleções acontecem,
// ou nenhuma — nunca deixamos o banco em estado inconsistente.

export async function cleanDatabase(): Promise<void> {
    await prismaTest.$transaction([
        // AuditLog usa onDelete: SetNull (não Cascade) — de propósito, pra
        // sobreviver à exclusão da conta (#08). Por isso precisa ser limpo
        // explicitamente aqui, não seria removido automaticamente pelo
        // delete de User.
        prismaTest.auditLog.deleteMany(),
        prismaTest.ioTDeviceConfig.deleteMany(),
        prismaTest.consumptionRecord.deleteMany(),
        prismaTest.alert.deleteMany(),
        prismaTest.device.deleteMany(),
        prismaTest.area.deleteMany(),
        prismaTest.property.deleteMany(),
        prismaTest.energyDistributor.deleteMany(),
        prismaTest.authToken.deleteMany(),
        prismaTest.passwordReset.deleteMany(),
        prismaTest.mfaBackupCode.deleteMany(),
        prismaTest.user.deleteMany(),
    ])
}