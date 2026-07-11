import type { Request, Response, NextFunction } from "express"
import type { PropertyService } from "@/modules/property/property.service.js"
import type { AuthenticatedRequest } from "@/shared/middlewares/authenticate.js"
import type { AuditService } from "@/shared/audit/audit.service.js"
import { getRequestContext } from "@/shared/audit/requestContext.js"

export class PropertyController {
    constructor(
        private readonly propertyService: PropertyService,
        private readonly auditService: AuditService,
    ) {}

    // POST /api/properties — Autenticado
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const property = await this.propertyService.create(userId, req.body)

            await this.auditService.record({
                userId,
                action: "PROPERTY_CREATE",
                outcome: "SUCCESS",
                resourceType: "Property",
                resourceId: property.id,
                ...getRequestContext(req),
            })

            res.status(201).json({ status: "success", data: property })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties?page=&pageSize= — Autenticado
    async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user
            const result = await this.propertyService.findAll(userId, req.query)
            res.status(200).json({ status: "success", data: result })
        } catch (error) {
            next(error)
        }
    }

    // GET /api/properties/:id — Autenticado
    async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: propertyId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const property = await this.propertyService.findById(propertyId, userId)
            res.status(200).json({ status: "success", data: property })
        } catch (error) {
            next(error)
        }
    }

    // PUT /api/properties/:id — Autenticado
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: propertyId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            const property = await this.propertyService.update(propertyId, userId, req.body)

            // Registra QUAIS campos mudaram (ex: "address", "city"), nunca os
            // valores — o audit log não deve se tornar, ele mesmo, um
            // repositório de dados pessoais (endereço).
            await this.auditService.record({
                userId,
                action: "PROPERTY_UPDATE",
                outcome: "SUCCESS",
                resourceType: "Property",
                resourceId: propertyId,
                metadata: { fields: Object.keys(req.body as object) },
                ...getRequestContext(req),
            })

            res.status(200).json({ status: "success", data: property })
        } catch (error) {
            next(error)
        }
    }

    // DELETE /api/properties/:id — Autenticado
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id: propertyId } = req.params as { id: string }
            const { id: userId } = (req as AuthenticatedRequest).user
            await this.propertyService.delete(propertyId, userId)

            await this.auditService.record({
                userId,
                action: "PROPERTY_DELETE",
                outcome: "SUCCESS",
                resourceType: "Property",
                resourceId: propertyId,
                ...getRequestContext(req),
            })

            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }
}
