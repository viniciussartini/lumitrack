import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AreaController } from "@/modules/area/area.controller.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { AreaService } from "@/modules/area/area.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"

// As rotas de área são aninhadas dentro de /api/properties/:propertyId/areas.
// O Express passa os parâmetros da rota pai (propertyId) quando usamos
// mergeParams: true no router filho.
export function areaRoutes(authenticate: RequestHandler, prismaClient: PrismaClient,

): Router {
    // mergeParams: true é obrigatório para que :propertyId da rota pai
    // fique disponível em req.params dentro deste router.
    const router = Router({ mergeParams: true })

    const propertyRepository = new PropertyRepository(prismaClient)
    const areaRepository = new AreaRepository(prismaClient)
    const areaService = new AreaService(areaRepository, propertyRepository)
    const areaController = new AreaController(areaService)

    // Rotas protegidas
    router.post("/", authenticate, (req, res, next) => areaController.create(req, res, next))
    router.get("/", authenticate, (req, res, next) => areaController.findAll(req, res, next))
    router.get("/:areaId", authenticate, (req, res, next) => areaController.findById(req, res, next))
    router.put("/:areaId", authenticate, (req, res, next) => areaController.update(req, res, next))
    router.delete("/:areaId", authenticate, (req, res, next) => areaController.delete(req, res, next))

    return router
}