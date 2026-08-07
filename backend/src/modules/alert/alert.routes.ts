import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AlertController } from "@/modules/alert/alert.controller.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { AlertService } from "@/modules/alert/alert.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"
import type { AlertEvaluator } from "@/modules/alert/alert-evaluator.js"

// Rota top-level: /api/alerts — alerta é um recurso independente vinculado a
// um medidor (via meterId no corpo da criação), não mais aninhado sob
// property/area/device (Fase 4 — a hierarquia do alvo já está no Meter).
// `alertEvaluator` é opcional: sem ele (ex.: alguns testes), o status vem
// sempre "normal" e /firing sempre vazio — nunca um 500.
export function alertRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
    alertEvaluator?: AlertEvaluator,
): Router {
    const router = Router()

    const alertRepository = new AlertRepository(prismaClient)
    const meterTargetRepos = {
        meterRepository: new MeterRepository(prismaClient),
        propertyRepository: new PropertyRepository(prismaClient),
        areaRepository: new AreaRepository(prismaClient),
        deviceRepository: new DeviceRepository(prismaClient),
    }
    const alertService = new AlertService(alertRepository, meterTargetRepos, alertEvaluator)
    const controller = new AlertController(alertService)

    router.post("/", authenticate, (req, res, next) => controller.create(req, res, next))
    router.get("/", authenticate, (req, res, next) => controller.findAll(req, res, next))

    // "/firing" precisa vir ANTES de "/:id" — senão o Express casaria
    // "firing" como se fosse o valor do param :id.
    router.get("/firing", authenticate, (req, res, next) => controller.findFiring(req, res, next))

    router.get("/:id", authenticate, (req, res, next) => controller.findById(req, res, next))
    router.put("/:id", authenticate, (req, res, next) => controller.update(req, res, next))
    router.patch("/:id/enabled", authenticate, (req, res, next) =>
        controller.patchEnabled(req, res, next),
    )
    router.delete("/:id", authenticate, (req, res, next) => controller.delete(req, res, next))

    return router
}
