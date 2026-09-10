import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"

const app = createApp({ prismaClient: prismaHttpTest })

// ─── Dados de apoio ───────────────────────────────────────────────────────────

const validUser = {
    email: "joao@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "João",
    lastName: "Silva",
    cpf: "529.982.247-25",
}

const anotherUser = {
    email: "maria@example.com",
    password: "Senha@123",
    userType: "INDIVIDUAL",
    acceptedTerms: true,
    firstName: "Maria",
    lastName: "Santos",
    cpf: "310.037.856-38",
}

const validAclContractBody = {
    retailerName: "Comerc Energia",
    submarket: "SOUTHEAST_CENTER_WEST",
    energySource: "CONVENTIONAL",
    energyPricePerMwh: 280,
    contractedVolumeMwh: 120,
    validFrom: "2026-01-01",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(user = validUser) {
    await request(app).post("/api/users").send(user)
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    return loginRes.body.data.token as string
}

// Cria user → distribuidora (catálogo) → property Grupo A já em ACL (via API real).
async function setupUserWithAclProperty(user = validUser) {
    const token = await registerAndLogin(user)
    const distributor = await createTestDistributor(prismaHttpTest)

    const propRes = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({
            name: "Frigorífico",
            distributorId: distributor.id,
            electricalSystem: "TRIPHASIC",
            tariffGroup: "GROUP_A",
            tariffSubgroup: "A4",
            tariffModality: "GREEN",
            contractedDemandKw: 200,
            contractingEnvironment: "ACL",
        })

    return { token, propertyId: propRes.body.data.id as string }
}

async function createAclContract(
    token: string,
    propertyId: string,
    body: Record<string, unknown> = validAclContractBody,
) {
    const res = await request(app)
        .post("/api/acl-contracts")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...body, propertyId })
    return res.body.data as { id: string }
}

beforeEach(async () => {
    await cleanHttpDatabase()
})
afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/acl-contracts
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/acl-contracts", () => {
    it("deve criar um contrato e retornar 201", async () => {
        const { token, propertyId } = await setupUserWithAclProperty()

        const response = await request(app)
            .post("/api/acl-contracts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validAclContractBody, propertyId })

        expect(response.status).toBe(201)
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.propertyId).toBe(propertyId)
        expect(response.body.data.retailerName).toBe("Comerc Energia")
        expect(response.body.data.energyPricePerMwh).toBe(280)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).post("/api/acl-contracts").send(validAclContractBody)
        expect(response.status).toBe(401)
    })

    it("deve retornar 403 ao tentar criar contrato com conta demo", async () => {
        const demoToken = await registerAndLogin({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        const demoUser = await prismaHttpTest.user.findUniqueOrThrow({
            where: { email: DEMO_RESIDENTIAL_EMAIL },
        })
        const dist = await createTestDistributor(prismaHttpTest)
        const property = await prismaHttpTest.property.create({
            data: {
                userId: demoUser.id,
                distributorId: dist.id,
                name: "Frigorífico da Demo",
                electricalSystem: "TRIPHASIC",
                tariffGroup: "GROUP_A",
                tariffSubgroup: "A4",
                tariffModality: "GREEN",
                contractedDemandKw: 200,
                contractingEnvironment: "ACL",
            },
        })

        const response = await request(app)
            .post("/api/acl-contracts")
            .set("Authorization", `Bearer ${demoToken}`)
            .send({ ...validAclContractBody, propertyId: property.id })

        expect(response.status).toBe(403)
        expect(response.body.message).toBe("Conta de demonstração é somente leitura")
    })

    it("deve retornar 404 para propertyId inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .post("/api/acl-contracts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validAclContractBody, propertyId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao vincular propriedade de outro usuário", async () => {
        const { propertyId } = await setupUserWithAclProperty(validUser)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .post("/api/acl-contracts")
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ ...validAclContractBody, propertyId })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para propriedade ainda no ambiente cativo (ACR)", async () => {
        const token = await registerAndLogin()
        const distributor = await createTestDistributor(prismaHttpTest)
        const propRes = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Galpão",
                distributorId: distributor.id,
                electricalSystem: "TRIPHASIC",
                tariffGroup: "GROUP_A",
                tariffSubgroup: "A4",
                tariffModality: "GREEN",
                contractedDemandKw: 200,
            })

        const response = await request(app)
            .post("/api/acl-contracts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validAclContractBody, propertyId: propRes.body.data.id })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para preço de energia zero ou negativo", async () => {
        const { token, propertyId } = await setupUserWithAclProperty()

        const response = await request(app)
            .post("/api/acl-contracts")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validAclContractBody, propertyId, energyPricePerMwh: 0 })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 quando validTo é anterior a validFrom", async () => {
        const { token, propertyId } = await setupUserWithAclProperty()

        const response = await request(app)
            .post("/api/acl-contracts")
            .set("Authorization", `Bearer ${token}`)
            .send({
                ...validAclContractBody,
                propertyId,
                validFrom: "2026-06-01",
                validTo: "2026-01-01",
            })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/acl-contracts
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/acl-contracts", () => {
    it("deve retornar 200 com envelope paginado vazio", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/acl-contracts")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toEqual([])
        expect(response.body.data.total).toBe(0)
    })

    it("deve retornar apenas os contratos do usuário autenticado", async () => {
        const { token: tokenA, propertyId: propertyIdA } = await setupUserWithAclProperty(validUser)
        const { token: tokenB, propertyId: propertyIdB } =
            await setupUserWithAclProperty(anotherUser)
        await createAclContract(tokenA, propertyIdA)
        await createAclContract(tokenB, propertyIdB)

        const response = await request(app)
            .get("/api/acl-contracts")
            .set("Authorization", `Bearer ${tokenA}`)

        expect(response.body.data.items).toHaveLength(1)
        expect(response.body.data.items[0].propertyId).toBe(propertyIdA)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/acl-contracts")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/acl-contracts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/acl-contracts/:id", () => {
    it("deve retornar 200 com os dados do contrato", async () => {
        const { token, propertyId } = await setupUserWithAclProperty()
        const contract = await createAclContract(token, propertyId)

        const response = await request(app)
            .get(`/api/acl-contracts/${contract.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(contract.id)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .get("/api/acl-contracts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao acessar contrato de outro usuário", async () => {
        const { token: tokenA, propertyId } = await setupUserWithAclProperty(validUser)
        const contract = await createAclContract(tokenA, propertyId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .get(`/api/acl-contracts/${contract.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/acl-contracts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/acl-contracts/:id", () => {
    it("deve atualizar o contrato e retornar 200", async () => {
        const { token, propertyId } = await setupUserWithAclProperty()
        const contract = await createAclContract(token, propertyId)

        const response = await request(app)
            .put(`/api/acl-contracts/${contract.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ energyPricePerMwh: 295 })

        expect(response.status).toBe(200)
        expect(response.body.data.energyPricePerMwh).toBe(295)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .put("/api/acl-contracts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)
            .send({ energyPricePerMwh: 300 })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao atualizar contrato de outro usuário", async () => {
        const { token: tokenA, propertyId } = await setupUserWithAclProperty(validUser)
        const contract = await createAclContract(tokenA, propertyId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .put(`/api/acl-contracts/${contract.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ energyPricePerMwh: 300 })

        expect(response.status).toBe(403)
    })

    it("deve retornar 422 para corpo vazio", async () => {
        const { token, propertyId } = await setupUserWithAclProperty()
        const contract = await createAclContract(token, propertyId)

        const response = await request(app)
            .put(`/api/acl-contracts/${contract.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({})

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/acl-contracts/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/acl-contracts/:id", () => {
    it("deve deletar o contrato e retornar 204", async () => {
        const { token, propertyId } = await setupUserWithAclProperty()
        const contract = await createAclContract(token, propertyId)

        const response = await request(app)
            .delete(`/api/acl-contracts/${contract.id}`)
            .set("Authorization", `Bearer ${token}`)
        expect(response.status).toBe(204)

        const getResponse = await request(app)
            .get(`/api/acl-contracts/${contract.id}`)
            .set("Authorization", `Bearer ${token}`)
        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 403 ao deletar contrato de outro usuário", async () => {
        const { token: tokenA, propertyId } = await setupUserWithAclProperty(validUser)
        const contract = await createAclContract(tokenA, propertyId)
        const tokenB = await registerAndLogin(anotherUser)

        const response = await request(app)
            .delete(`/api/acl-contracts/${contract.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const token = await registerAndLogin()

        const response = await request(app)
            .delete("/api/acl-contracts/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).delete(
            "/api/acl-contracts/00000000-0000-0000-0000-000000000000",
        )
        expect(response.status).toBe(401)
    })
})
