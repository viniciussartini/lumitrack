import { Router, type RequestHandler } from "express"
import { PrismaClient } from "@/generated/prisma/client.js"
import { AclContractController } from "@/modules/acl-contract/acl-contract.controller.js"
import { AclContractRepository } from "@/modules/acl-contract/acl-contract.repository.js"
import { AclContractService } from "@/modules/acl-contract/acl-contract.service.js"
import { PropertyRepository } from "@/modules/property/property.repository.js"
import { blockDemoWrite } from "@/shared/middlewares/blockDemoWrite.js"

// Rota top-level: /api/acl-contracts — mesma convenção de /api/demand-alerts
// (recurso independente vinculado a uma propriedade via propertyId no corpo
// da criação, não aninhado sob property).
export function aclContractRoutes(
    authenticate: RequestHandler,
    prismaClient: PrismaClient,
): Router {
    const router = Router()

    const aclContractRepository = new AclContractRepository(prismaClient)
    const propertyRepository = new PropertyRepository(prismaClient)
    const aclContractService = new AclContractService(aclContractRepository, propertyRepository)
    const controller = new AclContractController(aclContractService)

    router.post("/", authenticate, blockDemoWrite, (req, res, next) =>
        controller.create(req, res, next),
    )
    router.get("/", authenticate, (req, res, next) => controller.findAll(req, res, next))

    router.get("/:id", authenticate, (req, res, next) => controller.findById(req, res, next))
    router.put("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.update(req, res, next),
    )
    router.delete("/:id", authenticate, blockDemoWrite, (req, res, next) =>
        controller.delete(req, res, next),
    )

    return router
}
