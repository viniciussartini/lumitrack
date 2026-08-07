import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { TariffFlagController } from "@/modules/tariff-flag/tariff-flag.controller.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { TariffFlagHistoryRepository } from "@/modules/tariff-flag/tariff-flag-history.repository.js"
import { TariffFlagService } from "@/modules/tariff-flag/tariff-flag.service.js"
import { requireRole } from "@/shared/middlewares/requireRole.js"

// Configuração singleton da bandeira tarifária vigente. Leitura pública
// (sem autenticação) — decisão do usuário (2026-08-05): a bandeira não é
// dado sensível/pessoal (a própria ANEEL já publica isso abertamente, ver
// ADR-0007) e passou a ser exibida na Landing e no Login, telas sem sessão.
// Único GET público do backend hoje — todo o resto exige `authenticate`.
// Atualização (`PUT`) continua restrita a administradores.
export function tariffFlagRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const tariffFlagRepository = new TariffFlagRepository(prismaClient)
    const tariffFlagHistoryRepository = new TariffFlagHistoryRepository(prismaClient)
    const tariffFlagService = new TariffFlagService(
        tariffFlagRepository,
        tariffFlagHistoryRepository,
    )
    const controller = new TariffFlagController(tariffFlagService)

    router.get("/", (req, res, next) => controller.get(req, res, next))
    router.put("/", authenticate, requireRole("ADMIN"), (req, res, next) =>
        controller.update(req, res, next),
    )

    return router
}
