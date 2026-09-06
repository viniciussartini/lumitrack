import type {
    PrismaClient,
    TariffPost,
    TariffSubgroup,
    TariffModality,
} from "@/generated/prisma/client.js"

export type TariffEnergyRateResponse = {
    post: TariffPost
    tusdPerKwh: number
    tePerKwh: number
}

export type TariffSingleDemandRateResponse = {
    tusdPerKw: number
}

// Cache em nível de módulo, mesmo padrão de DistributorRepository (catálogo
// somente leitura, sem caminho de escrita em runtime — TTL curto em vez de
// invalidação por evento).
const CACHE_TTL_MS = 5 * 60 * 1000
const energyRatesCache = new Map<string, { value: TariffEnergyRateResponse[]; cachedAt: number }>()
const singleDemandRateCache = new Map<
    string,
    { value: TariffSingleDemandRateResponse | null; cachedAt: number }
>()

function cacheKey(
    distributorId: string,
    subgroup: TariffSubgroup,
    modality: TariffModality,
): string {
    return `${distributorId}:${subgroup}:${modality}`
}

/**
 * Catálogo tarifário do Grupo A (RF26) — tarifas de energia por posto e de
 * demanda por distribuidora × subgrupo × modalidade, somente leitura.
 */
export class TariffCatalogRepository {
    /** @param prisma - Cliente Prisma usado para consultar o catálogo tarifário do Grupo A. */
    constructor(private readonly prisma: PrismaClient) {}

    /**
     * Tarifas de energia (TUSD + TE) por posto, para uma combinação
     * distribuidora × subgrupo × modalidade.
     *
     * @param distributorId - Id da distribuidora.
     * @param subgroup - Subgrupo do Grupo A (A1-A4, AS).
     * @param modality - Modalidade tarifária (GREEN, BLUE, CONVENTIONAL_BINOMIAL).
     * @returns As tarifas de energia cadastradas (uma por posto), servidas do cache quando ainda dentro do TTL.
     */
    async findEnergyRates(
        distributorId: string,
        subgroup: TariffSubgroup,
        modality: TariffModality,
    ): Promise<TariffEnergyRateResponse[]> {
        const key = cacheKey(distributorId, subgroup, modality)
        const cached = energyRatesCache.get(key)
        if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            return cached.value
        }

        const rows = await this.prisma.tariffEnergyRate.findMany({
            where: { distributorId, subgroup, modality },
        })
        const value = rows.map((r) => ({
            post: r.post,
            tusdPerKwh: r.tusdPerKwh.toNumber(),
            tePerKwh: r.tePerKwh.toNumber(),
        }))

        energyRatesCache.set(key, { value, cachedAt: Date.now() })
        return value
    }

    /**
     * Tarifa de demanda única (posto nulo) — Horária Verde e Convencional
     * Binômia (RN18). A Horária Azul (demanda por posto) é extensão de
     * modelo da Fase 20, fora do escopo deste método.
     *
     * `post: null` não pode entrar na cláusula `where` de uma chave composta
     * via `findUnique` (Prisma rejeita `null` em `where` de unique compostas
     * em runtime) — usa `findFirst`, mesma solução já aplicada no seed do
     * catálogo (ver ADR-0019).
     *
     * @param distributorId - Id da distribuidora.
     * @param subgroup - Subgrupo do Grupo A (A1-A4, AS).
     * @param modality - Modalidade tarifária.
     * @returns A tarifa de demanda única, ou `null` se não cadastrada.
     */
    async findSingleDemandRate(
        distributorId: string,
        subgroup: TariffSubgroup,
        modality: TariffModality,
    ): Promise<TariffSingleDemandRateResponse | null> {
        const key = cacheKey(distributorId, subgroup, modality)
        const cached = singleDemandRateCache.get(key)
        if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            return cached.value
        }

        const row = await this.prisma.tariffDemandRate.findFirst({
            where: { distributorId, subgroup, modality, post: null },
        })
        const value = row ? { tusdPerKw: row.tusdPerKw.toNumber() } : null

        singleDemandRateCache.set(key, { value, cachedAt: Date.now() })
        return value
    }
}

/**
 * Estado de módulo sobrevive entre testes do mesmo arquivo — chamado por
 * `cleanDatabase()`, mesmo tratamento de `resetDistributorCacheForTests()`.
 */
export function resetTariffCatalogCacheForTests(): void {
    energyRatesCache.clear()
    singleDemandRateCache.clear()
}
