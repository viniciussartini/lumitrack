import { Router } from "express"
import { NotFoundError } from "@/shared/errors.js"
import type { SimulationStore } from "@/simulation/store.js"
import type { SimulationEngine } from "@/simulation/simulationEngine.js"
import { anomalySchema, powerSchema, updateDeviceSchema } from "@/api/schemas.js"

export function devicesRoutes(store: SimulationStore, engine: SimulationEngine): Router {
    const router = Router()

    router.patch("/:id", (req, res) => {
        const patch = updateDeviceSchema.parse(req.body)
        const device = store.updateDevice(req.params.id!, patch)
        if (!device) throw new NotFoundError("Dispositivo não encontrado")

        res.json(device)
    })

    router.delete("/:id", (req, res) => {
        engine.removeDevice(req.params.id!)
        const deleted = store.deleteDevice(req.params.id!)
        if (!deleted) throw new NotFoundError("Dispositivo não encontrado")

        res.status(204).end()
    })

    router.post("/:id/power", (req, res) => {
        const { on } = powerSchema.parse(req.body)
        const device = on ? engine.powerOn(req.params.id!) : engine.powerOff(req.params.id!)
        if (!device) throw new NotFoundError("Dispositivo não encontrado")

        res.json(device)
    })

    router.post("/:id/anomaly", (req, res) => {
        const { multiplier, durationSeconds } = anomalySchema.parse(req.body ?? {})
        const device = engine.triggerAnomaly(req.params.id!, multiplier, durationSeconds)
        if (!device) throw new NotFoundError("Dispositivo não encontrado")

        res.json(device)
    })

    router.delete("/:id/anomaly", (req, res) => {
        const device = engine.clearAnomaly(req.params.id!)
        if (!device) throw new NotFoundError("Dispositivo não encontrado")

        res.json(device)
    })

    return router
}
