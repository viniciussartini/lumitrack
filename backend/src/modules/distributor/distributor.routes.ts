import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { DistributorController } from "@/modules/distributor/distributor.controller.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { DistributorService } from "@/modules/distributor/distributor.service.js"

export function distributorRoutes(authenticate: RequestHandler, prismaClient: PrismaClient): Router {
    const router = Router()

    const distributorRepository = new DistributorRepository(prismaClient)
    const distributorService = new DistributorService(distributorRepository)
    const distributorController = new DistributorController(distributorService)

    // Rotas protegidas
    router.post("/", authenticate, (req, res, next) => distributorController.create(req, res, next))
    router.get("/", authenticate, (req, res, next) => distributorController.findAll(req, res, next))
    router.get("/:id", authenticate, (req, res, next) => distributorController.findById(req, res, next))
    router.put("/:id", authenticate, (req, res, next) => distributorController.update(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => distributorController.delete(req, res, next))

    return router
}