import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { SimulationController } from "@/modules/simulation/simulation.controller.js"
import { SimulationService } from "@/modules/simulation/simulation.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { AreaRepository } from "@/modules/area/area.repository.js"
import { DeviceRepository } from "@/modules/device/device.repository.js"

function buildController(prismaClient: PrismaClient): SimulationController {
    const propertyRepository    = new PropertyRepository(prismaClient)
    const distributorRepository = new DistributorRepository(prismaClient)
    const areaRepository        = new AreaRepository(prismaClient)
    const deviceRepository      = new DeviceRepository(prismaClient)

    const simulationService = new SimulationService(
        propertyRepository,
        distributorRepository,
        areaRepository,
        deviceRepository,
    )

    return new SimulationController(simulationService)
}

// Router: Simulation
// Montado em property.routes como:
//   router.use("/:propertyId/simulation", simulationRoutes(authenticate, prismaClient))
//
// mergeParams: true propaga :propertyId do router pai.
export function simulationRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router     = Router({ mergeParams: true })
    const controller = buildController(prismaClient)

    router.post("/", authenticate, (req, res, next) => controller.simulate(req, res, next))

    return router
}