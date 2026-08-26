import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AlertController } from "@/modules/alert/alert.controller.js"
import { AlertRepository } from "@/modules/alert/alert.repository.js"
import { AlertService } from "@/modules/alert/alert.service.js"
import { MeterRepository } from "@/modules/meter/meter.repository.js"
import type { AlertEvaluator } from "@/modules/alert/alert-evaluator.js"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"

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
    const meterTargetRepos = { meterRepository: new MeterRepository(prismaClient) }
    const alertService = new AlertService(alertRepository, meterTargetRepos, alertEvaluator)
    const controller = new AlertController(alertService)

    router.post("/", authenticate, blockDemoWrite, (req, res, next) =>
        controller.create(req, res, next),
    )
    router.get("/", authenticate, (req, res, next) => controller.findAll(req, res, next))

    // "/firing" e "/stats" precisam vir ANTES de "/:id" — senão o Express
    // casaria "firing"/"stats" como se fossem o valor do param :id.
    router.get("/firing", authenticate, (req, res, next) => controller.findFiring(req, res, next))
    router.get("/stats", authenticate, (req, res, next) => controller.stats(req, res, next))

    router.get("/:id", authenticate, (req, res, next) => controller.findById(req, res, next))
    router.put("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.update(req, res, next),
    )
    router.patch("/:id/enabled", authenticate, blockDemoWrite, (req, res, next) =>
        controller.patchEnabled(req, res, next),
    )
    router.delete("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.delete(req, res, next),
    )

    return router
}
