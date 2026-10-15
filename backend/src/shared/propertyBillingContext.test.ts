import { describe, it, expect, vi } from "vitest"
import type { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import type { MeterRepository } from "@/modules/meter/meter.repository.js"
import type { PropertyRepository } from "@/modules/property/property.repository.js"
import type { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"
import {
    loadOwnedProperty,
    loadOwnedPropertyBillingContext,
    requireDistributor,
    requireFlagPer100Kwh,
} from "@/shared/propertyBillingContext.js"

const property = { id: "prop-1", userId: "user-1", distributorId: "dist-1" }
const distributor = { id: "dist-1" }
const flagConfig = {
    currentFlag: "YELLOW",
    greenPer100Kwh: 0,
    yellowPer100Kwh: 1.885,
    redP1Per100Kwh: 4.463,
    redP2Per100Kwh: 7.877,
}

function makeRepositories(
    overrides: {
        property?: unknown
        meter?: unknown
        distributor?: unknown
        flag?: unknown
    } = {},
) {
    const has = (key: keyof typeof overrides, fallback: unknown) =>
        key in overrides ? overrides[key] : fallback
    return {
        propertyRepository: {
            findById: vi.fn().mockResolvedValue(has("property", property)),
        } as unknown as PropertyRepository,
        meterRepository: {
            findByTarget: vi.fn().mockResolvedValue(has("meter", { id: "meter-1" })),
        } as unknown as MeterRepository,
        distributorRepository: {
            findById: vi.fn().mockResolvedValue(has("distributor", distributor)),
        } as unknown as DistributorRepository,
        tariffFlagRepository: {
            get: vi.fn().mockResolvedValue(has("flag", flagConfig)),
        } as unknown as TariffFlagRepository,
    }
}

describe("loadOwnedProperty", () => {
    it("devolve a propriedade do usuário", async () => {
        const { propertyRepository } = makeRepositories()

        await expect(loadOwnedProperty(propertyRepository, "prop-1", "user-1")).resolves.toBe(
            property,
        )
    })

    it("404 quando a propriedade não existe e 403 quando é de outro usuário", async () => {
        const missing = makeRepositories({ property: null }).propertyRepository
        const notYours = makeRepositories().propertyRepository

        await expect(loadOwnedProperty(missing, "prop-1", "user-1")).rejects.toThrow(NotFoundError)
        await expect(loadOwnedProperty(notYours, "prop-1", "outro")).rejects.toThrow(ForbiddenError)
    })
})

describe("requireDistributor / requireFlagPer100Kwh", () => {
    it("falham fechado quando o cadastro não existe", async () => {
        const repos = makeRepositories({ distributor: null, flag: null })

        await expect(requireDistributor(repos.distributorRepository, "dist-1")).rejects.toThrow(
            NotFoundError,
        )
        await expect(requireFlagPer100Kwh(repos.tariffFlagRepository)).rejects.toThrow(
            NotFoundError,
        )
    })

    it("a bandeira vigente vira o adicional em R$ por 100 kWh", async () => {
        const { tariffFlagRepository } = makeRepositories()

        await expect(requireFlagPer100Kwh(tariffFlagRepository)).resolves.toBeCloseTo(1.885)
    })
})

describe("loadOwnedPropertyBillingContext", () => {
    it("carrega propriedade, medidor, distribuidora e bandeira", async () => {
        const repos = makeRepositories()

        const context = await loadOwnedPropertyBillingContext("user-1", "prop-1", repos)

        expect(context).toMatchObject({
            property,
            meterId: "meter-1",
            distributor,
            flagPer100Kwh: 1.885,
        })
    })

    it("a verificação da propriedade vem logo depois da posse e antes de buscar o medidor", async () => {
        const repos = makeRepositories({ meter: null })

        await expect(
            loadOwnedPropertyBillingContext("user-1", "prop-1", repos, {
                property: () => {
                    throw new ValidationError("modalidade errada")
                },
            }),
        ).rejects.toThrow(ValidationError)
        expect(repos.meterRepository.findByTarget).not.toHaveBeenCalled()
    })

    it("a posse vem antes da verificação da propriedade", async () => {
        const repos = makeRepositories()
        const check = vi.fn()

        await expect(
            loadOwnedPropertyBillingContext("outro", "prop-1", repos, { property: check }),
        ).rejects.toThrow(ForbiddenError)
        expect(check).not.toHaveBeenCalled()
    })

    it("sem medidor falha com 404 antes de olhar a distribuidora", async () => {
        const repos = makeRepositories({ meter: null })

        await expect(loadOwnedPropertyBillingContext("user-1", "prop-1", repos)).rejects.toThrow(
            "Esta propriedade não possui medidor vinculado",
        )
        expect(repos.distributorRepository.findById).not.toHaveBeenCalled()
    })

    it("a verificação da distribuidora vem antes de ler a bandeira", async () => {
        const repos = makeRepositories({ flag: null })

        await expect(
            loadOwnedPropertyBillingContext("user-1", "prop-1", repos, {
                distributor: () => {
                    throw new ValidationError("sem janela de ponta")
                },
            }),
        ).rejects.toThrow(ValidationError)
        expect(repos.tariffFlagRepository.get).not.toHaveBeenCalled()
    })

    it("sem bandeira falha fechado", async () => {
        const repos = makeRepositories({ flag: null })

        await expect(loadOwnedPropertyBillingContext("user-1", "prop-1", repos)).rejects.toThrow(
            NotFoundError,
        )
    })
})
