import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { DistributorController } from "@/modules/distributor/distributor.controller.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"

// Catálogo global de distribuidoras — somente leitura (populado via seed).
export function distributorRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router()

    const distributorRepository = new DistributorRepository(prismaClient)
    const distributorService = new DistributorService(distributorRepository)
    const distributorController = new DistributorController(distributorService)

    router.get("/", authenticate, (req, res, next) => distributorController.findAll(req, res, next))
    router.get("/:id", authenticate, (req, res, next) =>
        distributorController.findById(req, res, next),
    )

    return router
}
