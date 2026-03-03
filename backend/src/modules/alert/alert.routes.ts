import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AlertController } from "@/modules/alert/alert.controller.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { AlertService } from "@/modules/alert/alert.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"

function buildController(prismaClient: PrismaClient): AlertController {
    const alertRepository = new AlertRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)
    const areaRepository = new AreaRepository(prismaClient)
    const deviceRepository = new DeviceRepository(prismaClient)
    const alertService = new AlertService(alertRepository, propertyRepository, areaRepository, deviceRepository)
    return new AlertController(alertService)
}

// ─── Rota global: /api/alerts ─────────────────────────────────────────────────
// Listagem geral + operações sobre alertas individuais (sem contexto de target).
// Montada diretamente no app.ts.
export function alertRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router()
    const controller = buildController(prismaClient)

    router.get("/", authenticate, (req, res, next) => controller.findAll(req, res, next))
    router.get("/:id", authenticate, (req, res, next) => controller.findById(req, res, next))
    router.put("/:id", authenticate, (req, res, next) => controller.update(req, res, next))
    router.patch("/:id/read", authenticate, (req, res, next) => controller.markAsRead(req, res, next))
    router.delete("/:id", authenticate, (req, res, next) => controller.delete(req, res, next))

    return router
}

// Rotas aninhadas: PROPERTY
// Montada em property.routes como:
// router.use("/:propertyId/alerts", propertyAlertRoutes(...))
export function propertyAlertRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    router.post("/", authenticate, (req, res, next) => controller.createForProperty(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.findAllForProperty(req, res, next))

    return router
}

// Rotas aninhadas: AREA
// Montada em area.routes como:
// router.use("/:areaId/alerts", areaAlertRoutes(...))
export function areaAlertRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    router.post("/", authenticate, (req, res, next) => controller.createForArea(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.findAllForArea(req, res, next))

    return router
}

// Rotas aninhadas: DEVICE 
// Montada em device.routes como:
// router.use("/:deviceId/alerts", deviceAlertRoutes(...))
export function deviceAlertRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    router.post("/", authenticate, (req, res, next) => controller.createForDevice(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.findAllForDevice(req, res, next))

    return router
}