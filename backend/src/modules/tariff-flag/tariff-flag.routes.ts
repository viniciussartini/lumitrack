import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { TariffFlagController } from "@/modules/tariff-flag/tariff-flag.controller.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { TariffFlagService } from "@/modules/tariff-flag/tariff-flag.service.js"
import { requireRole } from "@/shared/middlewares/requireRole.js"

// Configuração singleton da bandeira tarifária vigente. Leitura liberada a
// qualquer usuário autenticado (usada pelo TariffService para o cálculo de
// custo); atualização restrita a administradores — o projeto já tem RBAC
// mínimo (#16), então não é mais um "admin futuro" como o plano original
// previa antes do RBAC existir.
export function tariffFlagRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const tariffFlagRepository = new TariffFlagRepository(prismaClient)
    const tariffFlagService = new TariffFlagService(tariffFlagRepository)
    const controller = new TariffFlagController(tariffFlagService)

    router.get("/", authenticate, (req, res, next) => controller.get(req, res, next))
    router.put("/", authenticate, requireRole("ADMIN"), (req, res, next) => controller.update(req, res, next))

    return router
}
