import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { PropertyController } from "@/modules/property/property.controller.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"

export function propertyRoutes(authenticate: RequestHandler, prismaClient: PrismaClient

): Router {
    const router = Router()

    // PropertyService depende de DistributorRepository para validar posse
    // da distribuidora antes de criar/atualizar uma propriedade.
    const distributorRepository = new DistributorRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)
    const propertyService = new PropertyService(propertyRepository, distributorRepository)
    const propertyController = new PropertyController(propertyService)

    // Rotas protegidas
    router.post("/", authenticate, (req, res, next) => propertyController.create(req, res, next))
    router.get("/", authenticate, (req, res, next) => propertyController.findAll(req, res, next))
    router.get("/:id", authenticate, (req, res, next) => propertyController.findById(req, res, next))
    router.put("/:id", authenticate, (req, res, next) => propertyController.update(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => propertyController.delete(req, res, next))

    return router
}