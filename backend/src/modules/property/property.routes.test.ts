import { describe, it, expect, beforeEach, afterAll } from "vitest"
import request from "supertest"
import { createApp } from "@/app.js"
import { prismaHttpTest } from "@/shared/test/prisma-http-test.js"
import { cleanHttpDatabase } from "@/shared/test/clean-http-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { DEMO_RESIDENTIAL_EMAIL } from "@/shared/config/demoAccounts.js"
import { encryptAddress, decryptAddress } from "@/shared/crypto/addressEncryption.js"

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

const validPropertyBody = {
    name: "Casa Principal",
    address: "Rua das Flores, 123",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30130-010",
    electricalSystem: "TRIPHASIC",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// channel: "MOBILE" porque só precisamos de um Bearer token para autenticar
// via header — WEB não devolve token no body (cookie httpOnly).
async function registerAndLogin(user = validUser) {
    const createRes = await request(app).post("/api/users").send(user)
    const userId = createRes.body.data.id as string
    const loginRes = await request(app).post("/api/auth/login").send({
        email: user.email,
        password: user.password,
        channel: "MOBILE",
    })
    const token = loginRes.body.data.token as string
    return { userId, token }
}

// Distribuidora é catálogo global — inserida direto no banco de teste, não
// existe POST /api/distributors.
async function createDistributor() {
    const dist = await createTestDistributor(prismaHttpTest)
    return { id: dist.id }
}

async function createProperty(token: string, distributorId: string, body = validPropertyBody) {
    const res = await request(app)
        .post("/api/properties")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...body, distributorId })
    return res.body.data as { id: string }
}

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanHttpDatabase()
})

afterAll(async () => {
    await prismaHttpTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/properties
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/properties", () => {
    it("deve criar uma propriedade com todos os campos e retornar 201", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id })

        expect(response.status).toBe(201)
        expect(response.body.status).toBe("success")
        expect(response.body.data.id).toBeDefined()
        expect(response.body.data.name).toBe("Casa Principal")
        expect(response.body.data.state).toBe("MG")
        expect(response.body.data.zipCode).toBe("30130-010")
        expect(response.body.data.distributorId).toBe(dist.id)
        expect(response.body.data.electricalSystem).toBe("TRIPHASIC")
        expect(response.body.data.billingClass).toBe("B1")
    })

    it("deve retornar 403 ao tentar criar propriedade com conta demo (issue #246)", async () => {
        const { token } = await registerAndLogin({ ...validUser, email: DEMO_RESIDENTIAL_EMAIL })
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id })

        expect(response.status).toBe(403)
        expect(response.body.message).toBe("Conta de demonstração é somente leitura")
    })

    it("deve criar uma propriedade sem campos de endereço e retornar 201", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Galpão", distributorId: dist.id, electricalSystem: "TRIPHASIC" })

        expect(response.status).toBe(201)
        expect(response.body.data.address).toBeNull()
        expect(response.body.data.city).toBeNull()
        expect(response.body.data.state).toBeNull()
        expect(response.body.data.zipCode).toBeNull()
    })

    it("deve aceitar billingClass e publicLightingFeeBrl explícitos", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({
                ...validPropertyBody,
                distributorId: dist.id,
                billingClass: "B3",
                publicLightingFeeBrl: 25.5,
            })

        expect(response.status).toBe(201)
        expect(response.body.data.billingClass).toBe("B3")
        expect(response.body.data.publicLightingFeeBrl).toBe(25.5)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .post("/api/properties")
            .send({ name: "X", distributorId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(401)
    })

    it("deve retornar 404 ao vincular distribuidora inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 422 quando electricalSystem está ausente", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Casa", distributorId: dist.id })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para UF inválida", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id, state: "XX" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para CEP com formato inválido", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id, zipCode: "30130010" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 para CEP com sequência repetida (00000-000)", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id, zipCode: "00000-000" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 422 quando distributorId não for UUID", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: "nao-e-uuid" })

        expect(response.status).toBe(422)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties", () => {
    it("deve retornar 200 com envelope paginado vazio", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .get("/api/properties")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toEqual([])
        expect(response.body.data.total).toBe(0)
    })

    it("deve retornar apenas as propriedades do usuário autenticado", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const dist = await createDistributor()

        await createProperty(tokenA, dist.id)
        await createProperty(tokenB, dist.id, { ...validPropertyBody, name: "Casa de B" })

        const responseA = await request(app)
            .get("/api/properties")
            .set("Authorization", `Bearer ${tokenA}`)

        expect(responseA.status).toBe(200)
        expect(responseA.body.data.items).toHaveLength(1)
        expect(responseA.body.data.items[0].name).toBe("Casa Principal")
    })

    it("deve paginar respeitando page e pageSize", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        for (let i = 0; i < 3; i++) {
            await createProperty(token, dist.id, { ...validPropertyBody, name: `Prop ${i}` })
        }

        const response = await request(app)
            .get("/api/properties?page=1&pageSize=2")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.items).toHaveLength(2)
        expect(response.body.data.total).toBe(3)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get("/api/properties")
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/properties/:id", () => {
    it("deve retornar 200 com os dados da propriedade do usuário autenticado", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .get(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body.data.id).toBe(property.id)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .get("/api/properties/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao acessar propriedade de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const dist = await createDistributor()
        const property = await createProperty(tokenA, dist.id)

        const response = await request(app)
            .get(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).get(
            "/api/properties/00000000-0000-0000-0000-000000000000",
        )
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/properties/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/properties/:id", () => {
    it("deve atualizar campos de endereço e retornar 200", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Casa Renovada", city: "Contagem" })

        expect(response.status).toBe(200)
        expect(response.body.data.name).toBe("Casa Renovada")
        expect(response.body.data.city).toBe("Contagem")
        expect(response.body.data.state).toBe("MG") // não mudou
    })

    it("deve permitir trocar a distribuidora e retornar 200", async () => {
        const { token } = await registerAndLogin()
        const dist1 = await createDistributor()
        const dist2 = await createDistributor()
        const property = await createProperty(token, dist1.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ distributorId: dist2.id })

        expect(response.status).toBe(200)
        expect(response.body.data.distributorId).toBe(dist2.id)
    })

    it("deve retornar 404 ao trocar para distribuidora inexistente", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ distributorId: "00000000-0000-0000-0000-000000000000" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 403 ao tentar atualizar propriedade de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const dist = await createDistributor()
        const property = await createProperty(tokenA, dist.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ name: "Tentativa" })

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .put("/api/properties/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "X" })

        expect(response.status).toBe(404)
    })

    it("deve retornar 422 para UF inválida na atualização", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ state: "ZZ" })

        expect(response.status).toBe(422)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app)
            .put("/api/properties/00000000-0000-0000-0000-000000000000")
            .send({ name: "X" })
        expect(response.status).toBe(401)
    })

    it("deve retornar 403 ao tentar escrever Property.address com conta demo (issue #246)", async () => {
        const { userId, token } = await registerAndLogin({
            ...validUser,
            email: DEMO_RESIDENTIAL_EMAIL,
        })
        const dist = await createDistributor()
        // POST está bloqueado para conta demo (teste acima) — a propriedade
        // precisa existir de antemão, inserida direto via Prisma (não é o
        // que está sob teste aqui: o que importa é que o PUT seja recusado
        // mesmo sobre uma propriedade que a própria conta demo já possui).
        const property = await prismaHttpTest.property.create({
            data: {
                userId,
                distributorId: dist.id,
                name: "Casa da Demo",
                address: encryptAddress("Endereço original"),
                electricalSystem: "TRIPHASIC",
            },
        })

        const response = await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ address: "Endereço forjado pelo visitante" })

        expect(response.status).toBe(403)
        expect(response.body.message).toBe("Conta de demonstração é somente leitura")

        const unchanged = await prismaHttpTest.property.findUnique({ where: { id: property.id } })
        expect(decryptAddress(unchanged!.address!)).toBe("Endereço original")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/properties/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/properties/:id", () => {
    it("deve deletar a propriedade e retornar 204", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const response = await request(app)
            .delete(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(204)

        const getResponse = await request(app)
            .get(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)

        expect(getResponse.status).toBe(404)
    })

    it("deve retornar 403 ao tentar deletar propriedade de outro usuário", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { token: tokenB } = await registerAndLogin(anotherUser)
        const dist = await createDistributor()
        const property = await createProperty(tokenA, dist.id)

        const response = await request(app)
            .delete(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(response.status).toBe(403)
    })

    it("deve retornar 404 para ID inexistente", async () => {
        const { token } = await registerAndLogin()

        const response = await request(app)
            .delete("/api/properties/00000000-0000-0000-0000-000000000000")
            .set("Authorization", `Bearer ${token}`)

        expect(response.status).toBe(404)
    })

    it("deve retornar 401 sem token", async () => {
        const response = await request(app).delete(
            "/api/properties/00000000-0000-0000-0000-000000000000",
        )
        expect(response.status).toBe(401)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Audit log (A09): PROPERTY_CREATE/UPDATE/DELETE + ACCESS_DENIED
// ─────────────────────────────────────────────────────────────────────────────

describe("Audit log", () => {
    it("registra PROPERTY_CREATE/SUCCESS ao criar", async () => {
        const { userId, token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const logs = await prismaHttpTest.auditLog.findMany({
            where: { action: "PROPERTY_CREATE" },
        })
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({
            outcome: "SUCCESS",
            resourceType: "Property",
            resourceId: property.id,
            userId,
        })
    })

    it("registra PROPERTY_UPDATE/SUCCESS com os nomes dos campos alterados (não os valores)", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ address: "Avenida Nova, 456" })

        const logs = await prismaHttpTest.auditLog.findMany({
            where: { action: "PROPERTY_UPDATE" },
        })
        expect(logs).toHaveLength(1)
        expect((logs[0]?.metadata as { fields?: string[] } | null)?.fields).toEqual(["address"])
    })

    it("registra PROPERTY_DELETE/SUCCESS ao deletar", async () => {
        const { userId, token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        await request(app)
            .delete(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)

        const logs = await prismaHttpTest.auditLog.findMany({
            where: { action: "PROPERTY_DELETE" },
        })
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({
            outcome: "SUCCESS",
            resourceType: "Property",
            resourceId: property.id,
            userId,
        })
    })

    it("registra ACCESS_DENIED ao tentar deletar propriedade de outro usuário (403)", async () => {
        const { token: tokenA } = await registerAndLogin(validUser)
        const { userId: userIdB, token: tokenB } = await registerAndLogin(anotherUser)
        const dist = await createDistributor()
        const property = await createProperty(tokenA, dist.id)

        await request(app)
            .delete(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${tokenB}`)

        const logs = await prismaHttpTest.auditLog.findMany({ where: { action: "ACCESS_DENIED" } })
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({
            outcome: "FAILURE",
            userId: userIdB,
            resourceType: "properties",
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Criptografia do endereço (A04/Art. 46)
// ─────────────────────────────────────────────────────────────────────────────

describe("Criptografia do endereço em repouso", () => {
    it("armazena address cifrado no banco (não em texto claro)", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const raw = await prismaHttpTest.property.findUnique({ where: { id: property.id } })

        expect(raw?.address).not.toBe(validPropertyBody.address)
        expect(raw?.address).not.toBeNull()
        // Ciphertext AES-256-GCM é base64 e não contém o texto claro
        expect(raw?.address).not.toContain("Rua das Flores")
    })

    it("armazena city, state e zipCode cifrados no banco", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const raw = await prismaHttpTest.property.findUnique({ where: { id: property.id } })

        expect(raw?.city).not.toBe(validPropertyBody.city)
        expect(raw?.state).not.toBe(validPropertyBody.state)
        expect(raw?.zipCode).not.toBe(validPropertyBody.zipCode)
    })

    it("a resposta da API contém o endereço em texto claro (decifrado pelo repository)", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        const response = await request(app)
            .post("/api/properties")
            .set("Authorization", `Bearer ${token}`)
            .send({ ...validPropertyBody, distributorId: dist.id })

        expect(response.body.data.address).toBe(validPropertyBody.address)
        expect(response.body.data.city).toBe(validPropertyBody.city)
        expect(response.body.data.state).toBe(validPropertyBody.state)
        expect(response.body.data.zipCode).toBe(validPropertyBody.zipCode)
    })

    it("mantém address null no banco quando não fornecido", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()

        await request(app).post("/api/properties").set("Authorization", `Bearer ${token}`).send({
            name: "Galpão Sem Endereço",
            distributorId: dist.id,
            electricalSystem: "TRIPHASIC",
        })

        const properties = await prismaHttpTest.property.findMany({
            where: { name: "Galpão Sem Endereço" },
        })
        expect(properties[0]?.address).toBeNull()
        expect(properties[0]?.city).toBeNull()
        expect(properties[0]?.state).toBeNull()
        expect(properties[0]?.zipCode).toBeNull()
    })

    it("atualiza o address cifrado no banco via PUT", async () => {
        const { token } = await registerAndLogin()
        const dist = await createDistributor()
        const property = await createProperty(token, dist.id)

        const novoEndereco = "Avenida Atualizada, 999"
        await request(app)
            .put(`/api/properties/${property.id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ address: novoEndereco })

        const raw = await prismaHttpTest.property.findUnique({ where: { id: property.id } })

        expect(raw?.address).not.toBe(novoEndereco)
        expect(raw?.address).not.toContain("Atualizada")
    })
})
