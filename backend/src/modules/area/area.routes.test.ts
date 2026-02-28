import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"

const app = createApp({ prismaClient: prismaHttpTest })

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const anotherUser = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

const validDistributorBody = {
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
}

const validAreaBody = {
    name: "Sala de Estar",
    description: "Área principal de convivência",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "WEB",
    })
    return loginRes.body.data.token as string
}

async function createDistributor(token: string) {
    const res = await request(app)
        .post("/api/distributors")
        .set("Authorization", `Bearer ${token}`)
        .send(validDistributorBody)
    return res.body.data as { id: string }
}

async function createProperty(token: string, distributorId: string) {
    const res = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Casa Principal", distributorId })
    return res.body.data as { id: string }
}

async function createArea(token: string, propertyId: string, body: Record<string, unknown> = validAreaBody) {
    const res = await request(app)
        .post(`/api/properties/${propertyId}/areas`)
        .set("Authorization", `Bearer ${token}`)
        .send(body)
    return res.body.data as { id: string }
}

// Setup completo: token + distribuidora + propriedade, pronto para testar áreas
async function setupFull(user = validUser) {
    const token = await registerAndLogin(user)
    const dist = await createDistributor(token)
    const property = await createProperty(token, dist.id)
    return { token, propertyId: property.id }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/properties/:propertyId/areas
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/areas", () => {
    it("deve criar uma área e retornar 201", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas`)
            .set("Authorization", `Bearer ${token}`)
            .send(validAreaBody)

        expect(response.status).toBe(201)
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.propertyId).toBe(propertyId)
        expect(response.body.data.name).toBe("Sala de Estar")
        expect(response.body.data.description).toBe("Área principal de convivência")
    })

    it("deve criar uma área sem description e retornar 201", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Garagem" })

        expect(response.status).toBe(201)
        expect(response.body.data.description).toBeNull()
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties/00000000-0000-0000-0000-000000000000/areas")
            .send(validAreaBody)

        expect(response.status).toBe(401)
    })

    it("deve retornar 404 para propertyId inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post("/api/properties/00000000-0000-0000-0000-000000000000/areas")
            .set("Authorization", `Bearer ${token}`)
            .send(validAreaBody)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao criar área em propriedade de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send(validAreaBody)

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para nome vazio", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para description acima de 1000 caracteres", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .post(`/api/properties/${propertyId}/areas`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Área", description: "x".repeat(1001) })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:propertyId/areas
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId/areas", () => {
    it("deve retornar 200 com lista vazia", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(`/api/properties/${propertyId}/areas`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual([])
    })

    it("deve retornar 200 com as áreas da propriedade ordenadas por nome", async () => {
        const { token, propertyId } = await setupFull()
        await createArea(token, propertyId, { name: "Quarto" })
        await createArea(token, propertyId, { name: "Cozinha" })
        await createArea(token, propertyId, { name: "Banheiro" })

        const response = await request(app)
            .get(`/api/properties/${propertyId}/areas`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toHaveLength(3)
        expect(response.body.data[0].name).toBe("Banheiro")
        expect(response.body.data[1].name).toBe("Cozinha")
        expect(response.body.data[2].name).toBe("Quarto")
    })

    it("deve retornar 403 ao listar áreas de propriedade de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/properties/${propertyId}/areas`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para propertyId inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000/areas")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000/areas")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:propertyId/areas/:areaId
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId/areas/:areaId", () => {
    it("deve retornar 200 com os dados da área", async () => {
        const { token, propertyId } = await setupFull()
        const area = await createArea(token, propertyId)

        const response = await request(app)
            .get(`/api/properties/${propertyId}/areas/${area.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(area.id)
    })

    it("deve retornar 404 para areaId inexistente", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .get(`/api/properties/${propertyId}/areas/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao acessar área via propertyId de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/properties/${propertyId}/areas/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 ao buscar área que pertence a outra propriedade", async () => {
        const { token, propertyId: propertyIdA } = await setupFull()

        // Segundo distribuidor com CNPJ diferente — o mesmo CNPJ do setup
        // causaria ConflictError 409 para o mesmo usuário.
        const distRes = await request(app)
            .post("/api/distributors")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validDistributorBody, cnpj: "02.429.144/0001-93", name: "CPFL" })
        const propertyB = await createProperty(token, distRes.body.data.id)
        const areaFromA = await createArea(token, propertyIdA)

        // A área existe mas pertence à propriedade A, não à B
        const response = await request(app)
            .get(`/api/properties/${propertyB.id}/areas/${areaFromA.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000/areas/00000000-0000-0000-0000-000000000000")

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/properties/:propertyId/areas/:areaId
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/properties/:propertyId/areas/:areaId", () => {
    it("deve atualizar a área e retornar 200", async () => {
        const { token, propertyId } = await setupFull()
        const area = await createArea(token, propertyId)

        const response = await request(app)
            .put(`/api/properties/${propertyId}/areas/${area.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Sala de Jantar", description: "Reformada" })

        expect(response.status).toBe(200)
        expect(response.body.data.name).toBe("Sala de Jantar")
        expect(response.body.data.description).toBe("Reformada")
    })

    it("deve retornar 404 para areaId inexistente", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .put(`/api/properties/${propertyId}/areas/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "X" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao tentar atualizar área de propriedade de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .put(`/api/properties/${propertyId}/areas/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ name: "X" })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para nome vazio na atualização", async () => {
        const { token, propertyId } = await setupFull()
        const area = await createArea(token, propertyId)

        const response = await request(app)
            .put(`/api/properties/${propertyId}/areas/${area.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .put("/api/properties/00000000-0000-0000-0000-000000000000/areas/00000000-0000-0000-0000-000000000000")
            .send({ name: "X" })

        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/properties/:propertyId/areas/:areaId
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/properties/:propertyId/areas/:areaId", () => {
    it("deve deletar a área e retornar 204", async () => {
        const { token, propertyId } = await setupFull()
        const area = await createArea(token, propertyId)

        const response = await request(app)
            .delete(`/api/properties/${propertyId}/areas/${area.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)

        const getResponse = await request(app)
            .get(`/api/properties/${propertyId}/areas/${area.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 403 ao tentar deletar área de propriedade de outro usuário", async () => {
        const { propertyId } = await setupFull(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/properties/${propertyId}/areas/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para areaId inexistente", async () => {
        const { token, propertyId } = await setupFull()

        const response = await request(app)
            .delete(`/api/properties/${propertyId}/areas/00000000-0000-0000-0000-000000000000`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .delete("/api/properties/00000000-0000-0000-0000-000000000000/areas/00000000-0000-0000-0000-000000000000")

        expect(response.status).toBe(401)
    })
})