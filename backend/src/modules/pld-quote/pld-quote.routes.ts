import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { PldQuoteController } from "@/modules/pld-quote/pld-quote.controller.js"
import { PldQuoteRepository } from "@/modules/pld-quote/pld-quote.repository.js"
import { PldQuoteService } from "@/modules/pld-quote/pld-quote.service.js"

// Catálogo global de PLD por submercado — somente leitura (populado via
// seed), mesma convenção de /api/distributors: sem ingestão automática da
// CCEE nesta fase.
export function pldQuoteRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const pldQuoteRepository = new PldQuoteRepository(prismaClient)
    const pldQuoteService = new PldQuoteService(pldQuoteRepository)
    const controller = new PldQuoteController(pldQuoteService)

    router.get("/", authenticate, (req, res, next) => controller.findAll(req, res, next))

    return router
}
