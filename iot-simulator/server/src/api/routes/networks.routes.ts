import { Router } from "express"
import { NotFoundError } from "@/shared/errors.js"
import type { SimulationStore } from "@/simulation/store.js"
import type { SimulationEngine } from "@/simulation/simulationEngine.js"
import { createDeviceSchema, createNetworkSchema } from "@/api/schemas.js"

export function networksRoutes(store: SimulationStore, engine: SimulationEngine): Router {
    const router = Router()

    router.get("/", (_req, res) => {
        res.json(store.snapshot())
    })

    router.post("/", (req, res) => {
        const { name } = createNetworkSchema.parse(req.body)
        const network = store.createNetwork(name)
        res.status(201).json(network)
    })

    router.delete("/:id", (req, res) => {
        const network = store.getNetwork(req.params.id!)
        if (!network) throw new NotFoundError("Rede não encontrada")

        for (const deviceId of network.devices.keys()) {
            engine.removeDevice(deviceId)
        }
        store.deleteNetwork(network.id)
        res.status(204).end()
    })

    router.get("/:id/devices", (req, res) => {
        const network = store.getNetwork(req.params.id!)
        if (!network) throw new NotFoundError("Rede não encontrada")

        res.json([...network.devices.values()])
    })

    router.post("/:id/devices", (req, res) => {
        const input = createDeviceSchema.parse(req.body)
        const device = store.createDevice(req.params.id!, input)
        if (!device) throw new NotFoundError("Rede não encontrada")

        res.status(201).json(device)
    })

    return router
}
