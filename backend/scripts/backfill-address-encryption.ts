import "dotenv/config"
import { prisma } from "@/shared/database/prisma.js"
import { encryptAddress, decryptAddress } from "@/shared/crypto/addressEncryption.js"

// Backfill único para a #15 (criptografia do endereço da propriedade em repouso).
//
// Roda contra o DATABASE_URL ativo no momento (ver backend/.env). Útil para
// migrar dados que já existiam em texto claro ANTES da #15 — não é necessário
// para os bancos de teste, que são truncados a cada execução da suíte
// (cleanDatabase()/cleanHttpDatabase()), nem para registros novos (já criados
// criptografados pelo PropertyRepository após a #15).
//
// Idempotente via heurística try-decrypt: tenta decifrar cada campo; se
// decryptAddress() retornar sem erro, o valor já está cifrado → skip.
// Se lançar (falha no auth tag do AES-256-GCM), o valor é texto claro →
// cifrar e atualizar. A verificação de auth tag torna falso-positivos
// negligíveis (probabilidade 2^-128).
//
// Ao contrário do backfill de CPF/CNPJ (#07), não há blind index aqui
// (endereço não tem constraint @unique e nunca é filtro de query) — a
// idempotência usa o try-decrypt em vez de "WHERE blindIndex IS NULL".
//
// Uso: npm run backfill:address
// (ou: npx tsx scripts/backfill-address-encryption.ts)

function needsEncryption(value: string): boolean {
    try {
        decryptAddress(value)
        return false // já cifrado
    } catch {
        return true // texto claro
    }
}

async function main() {
    try {
        const properties = await prisma.property.findMany({
            where: {
                OR: [
                    { address: { not: null } },
                    { city: { not: null } },
                    { state: { not: null } },
                    { zipCode: { not: null } },
                ],
            },
            select: { id: true, address: true, city: true, state: true, zipCode: true },
        })

        console.log(
            `Encontradas ${properties.length} propriedade(s) com campos de endereço preenchidos.`,
        )

        let updated = 0
        let skipped = 0

        for (const property of properties) {
            const addressNeedsEncryption = property.address && needsEncryption(property.address)
            const cityNeedsEncryption = property.city && needsEncryption(property.city)
            const stateNeedsEncryption = property.state && needsEncryption(property.state)
            const zipCodeNeedsEncryption = property.zipCode && needsEncryption(property.zipCode)

            if (
                !addressNeedsEncryption &&
                !cityNeedsEncryption &&
                !stateNeedsEncryption &&
                !zipCodeNeedsEncryption
            ) {
                skipped++
                continue
            }

            await prisma.property.update({
                where: { id: property.id },
                data: {
                    ...(addressNeedsEncryption && { address: encryptAddress(property.address!) }),
                    ...(cityNeedsEncryption && { city: encryptAddress(property.city!) }),
                    ...(stateNeedsEncryption && { state: encryptAddress(property.state!) }),
                    ...(zipCodeNeedsEncryption && { zipCode: encryptAddress(property.zipCode!) }),
                },
            })

            updated++
            console.log(`Propriedade ${property.id}: criptografada.`)
        }

        console.log(
            `\nBackfill concluído. Atualizadas: ${updated}. Já cifradas (skip): ${skipped}.`,
        )
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error("Backfill falhou:", error)
    process.exit(1)
})
