import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { PropertyController } from "@/modules/property/property.controller.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { PropertyService } from "@/modules/property/property.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { areaRoutes } from "@/modules/area/area.routes.js"
import { propertyConsumptionRoutes } from "@/modules/consumption/consumption.routes.js"
import { propertyAlertRoutes } from "@/modules/alert/alert.routes.js"
import { simulationRoutes } from "@/modules/simulation/simulation.routes.js"
import { reportRoutes } from "@/modules/report/report.routes.js"
import { AlertNotifier } from "../alert/alert-notifier.js"

export function propertyRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    alertNotifier: AlertNotifier,

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

    // Rotas aninhadas ANTES das rotas /:id — ordem crítica no Express.
    // Rotas aninhadas de área montadas aqui para que :propertyId fique
    // disponível via mergeParams no router filho (area).
    router.use("/:propertyId/areas", areaRoutes(authenticate, prismaClient, alertNotifier))
    router.use("/:propertyId/consumption", propertyConsumptionRoutes(authenticate, prismaClient, alertNotifier))
    router.use("/:propertyId/alerts", propertyAlertRoutes(authenticate, prismaClient, alertNotifier))
    router.use("/:propertyId/simulation", simulationRoutes(authenticate, prismaClient))
    router.use("/:propertyId/report", reportRoutes(authenticate, prismaClient))

    router.get("/:id", authenticate, (req, res, next) => propertyController.findById(req, res, next))
    router.put("/:id", authenticate, (req, res, next) => propertyController.update(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => propertyController.delete(req, res, next))


    return router
}