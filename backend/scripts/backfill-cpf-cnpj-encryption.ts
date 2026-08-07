import "dotenv/config"
import { prisma } from "@/shared/database/prisma.js"
import { encrypt } from "@/shared/crypto/encryption.js"
import { generateBlindIndex } from "@/shared/crypto/blindIndex.js"

// Backfill único para a criptografia de CPF/CNPJ em repouso.
//
// Roda contra o DATABASE_URL ativo no momento (ver backend/.env). Útil para
// migrar dados que já existiam em texto claro antes de a criptografia entrar
// em vigor — não é necessário para os bancos de teste, que são truncados a cada execução da
// suíte (cleanDatabase()/cleanHttpDatabase()), nem para registros novos
// (já são criados criptografados pelo UserRepository).
//
// Idempotente: usuários que já têm cpfBlindIndex/cnpjBlindIndex preenchido
// são ignorados — seguro rodar mais de uma vez.
//
// Uso: npx tsx scripts/backfill-cpf-cnpj-encryption.ts
async function main() {
    try {
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { cpf: { not: null }, cpfBlindIndex: null },
                    { cnpj: { not: null }, cnpjBlindIndex: null },
                ],
            },
            select: { id: true, cpf: true, cnpj: true },
        })

        console.log(`Encontrados ${users.length} usuário(s) com CPF/CNPJ pendente de criptografia.`)

        for (const user of users) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    cpf: user.cpf ? encrypt(user.cpf) : user.cpf,
                    cpfBlindIndex: user.cpf ? generateBlindIndex(user.cpf) : undefined,
                    cnpj: user.cnpj ? encrypt(user.cnpj) : user.cnpj,
                    cnpjBlindIndex: user.cnpj ? generateBlindIndex(user.cnpj) : undefined,
                },
            })
            console.log(`Usuário ${user.id}: criptografado.`)
        }

        console.log("Backfill concluído.")
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error("Backfill falhou:", error)
    process.exit(1)
})
