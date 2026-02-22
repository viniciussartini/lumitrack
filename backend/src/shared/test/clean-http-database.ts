import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"

// Apaga todos os dados do banco lumitrack_test_http na ordem correta
// das dependências — filhos antes dos pais, para não violar foreign keys.
// Usado no beforeEach dos testes de integração HTTP.

export async function cleanHttpDatabase(): Promise<void> {
    await prismaHttpTest.$transaction([
        prismaHttpTest.ioTDeviceConfig.deleteMany(),
        prismaHttpTest.consumptionRecord.deleteMany(),
        prismaHttpTest.alert.deleteMany(),
        prismaHttpTest.device.deleteMany(),
        prismaHttpTest.area.deleteMany(),
        prismaHttpTest.property.deleteMany(),
        prismaHttpTest.energyDistributor.deleteMany(),
        prismaHttpTest.authToken.deleteMany(),
        prismaHttpTest.passwordReset.deleteMany(),
        prismaHttpTest.user.deleteMany(),
    ])
}