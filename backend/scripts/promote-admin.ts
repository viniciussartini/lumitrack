import "dotenv/config"
import { prisma } from "@/shared/database/prisma.js"

// Promove um usuário a ADMIN por e-mail — necessário para o endpoint
// administrativo de audit log, que depende de RBAC real existir. Não há UI
// nem endpoint de gestão de usuários para conceder a primeira role ADMIN
// (problema do ovo e da galinha), então isso é resolvido via script,
// mesmo padrão dos scripts de backfill existentes.
//
// Roda contra o DATABASE_URL ativo no momento (ver backend/.env).
//
// Idempotente: se o usuário já é ADMIN, não faz nada e informa isso —
// seguro rodar mais de uma vez.
//
// Uso: npm run promote-admin -- someone@example.com
// (o "--" é necessário para o npm repassar o argumento ao script)

async function main() {
    const email = process.argv[2]

    if (!email) {
        console.error("Uso: npm run promote-admin -- <email>")
        process.exit(1)
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, role: true },
        })

        if (!user) {
            console.error(`Usuário não encontrado: ${email}`)
            process.exit(1)
        }

        if (user.role === "ADMIN") {
            console.log(`Usuário ${email} já é ADMIN — nada a fazer.`)
            return
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { role: "ADMIN" },
        })

        console.log(`Usuário ${email} promovido a ADMIN.`)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error("Promoção falhou:", error)
    process.exit(1)
})
