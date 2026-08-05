import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { AneelTariffFlagSource, TariffFlagSourceError } from "@/modules/tariff-flag/sync/AneelTariffFlagSource.js"

const ACIONAMENTO_RESOURCE_ID = "0591b8f6-fe54-437b-b72b-1aa2efd46e42"

// Valores reais verificados na investigação do ADR-0007 (2026-08-04):
// competência mais recente disponível era 2026-07-01 com "Amarela" ativa;
// REH nº 3.306/2024 (vigência 2024-04-01) é a linha de "Adicional" mais
// recente para as 3 modalidades não-verde.
const validAcionamentoBody = {
    success: true,
    result: {
        records: [
            { DatCompetencia: "2026-05-01", NomBandeiraAcionada: "Amarela" },
            { DatCompetencia: "2026-06-01", NomBandeiraAcionada: "Amarela" },
            { DatCompetencia: "2026-07-01", NomBandeiraAcionada: "Amarela" },
        ],
    },
}

const validAdicionalBody = {
    success: true,
    result: {
        records: [
            { DatVigencia: "2022-07-01", NomBandeiraAcionada: "Amarela", VlrAdicionalBandeiraRSMWh: "29,89" },
            { DatVigencia: "2022-07-01", NomBandeiraAcionada: "Vermelha P1", VlrAdicionalBandeiraRSMWh: "65,00" },
            { DatVigencia: "2022-07-01", NomBandeiraAcionada: "Vermelha P2", VlrAdicionalBandeiraRSMWh: "97,95" },
            { DatVigencia: "2024-04-01", NomBandeiraAcionada: "Amarela", VlrAdicionalBandeiraRSMWh: "18,85" },
            { DatVigencia: "2024-04-01", NomBandeiraAcionada: "Vermelha P1", VlrAdicionalBandeiraRSMWh: "44,63" },
            { DatVigencia: "2024-04-01", NomBandeiraAcionada: "Vermelha P2", VlrAdicionalBandeiraRSMWh: "78,77" },
        ],
    },
}

function mockFetchImplementation(url: string): Response {
    const body = url.includes(ACIONAMENTO_RESOURCE_ID) ? validAcionamentoBody : validAdicionalBody
    return new Response(JSON.stringify(body), { status: 200 })
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("AneelTariffFlagSource.fetchCurrent — happy path", () => {
    it("combina os 2 recursos e converte R$/MWh para R$/100kWh", async () => {
        const fetchMock = vi.fn(async (url: string) => mockFetchImplementation(url))
        vi.stubGlobal("fetch", fetchMock)

        const source = new AneelTariffFlagSource()
        const snapshot = await source.fetchCurrent()

        expect(snapshot).toEqual({
            flag: "YELLOW",
            greenPer100Kwh: 0,
            yellowPer100Kwh: 1.885,
            redP1Per100Kwh: 4.463,
            redP2Per100Kwh: 7.877,
        })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})

describe("AneelTariffFlagSource.fetchCurrent — indisponibilidade", () => {
    it("lança TariffFlagSourceError após esgotar as tentativas quando a rede falha", async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error("network error")
        })
        vi.stubGlobal("fetch", fetchMock)

        const source = new AneelTariffFlagSource()
        // O matcher precisa anexar seu handler de rejeição no mesmo tick em
        // que a promise é criada — por isso a asserção começa aqui, e o
        // avanço dos timers roda em paralelo com ela (não depois).
        const assertion = expect(source.fetchCurrent()).rejects.toThrow(TariffFlagSourceError)
        // A implementação faz sleep(500ms) entre tentativas — sob fake timers,
        // precisa avançar manualmente para a promise resolver.
        await vi.advanceTimersByTimeAsync(2000)
        await assertion
    })

    it("lança TariffFlagSourceError quando a ANEEL responde com status de erro", async () => {
        const fetchMock = vi.fn(async () => new Response("erro", { status: 503 }))
        vi.stubGlobal("fetch", fetchMock)

        const source = new AneelTariffFlagSource()
        const assertion = expect(source.fetchCurrent()).rejects.toThrow(TariffFlagSourceError)
        await vi.advanceTimersByTimeAsync(2000)
        await assertion
    })
})

describe("AneelTariffFlagSource.fetchCurrent — payload inválido", () => {
    it("lança TariffFlagSourceError quando o payload não bate com o schema esperado", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, result: {} }), { status: 200 }))
        vi.stubGlobal("fetch", fetchMock)

        const source = new AneelTariffFlagSource()

        await expect(source.fetchCurrent()).rejects.toThrow(TariffFlagSourceError)
    })

    it("lança TariffFlagSourceError quando um valor decimal vem malformado", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes(ACIONAMENTO_RESOURCE_ID)) return mockFetchImplementation(url)
            return new Response(
                JSON.stringify({
                    success: true,
                    result: {
                        records: [
                            // Mesmo formato malformado observado na investigação do
                            // ADR-0007 (",00" em vez de "0,00").
                            { DatVigencia: "2024-04-01", NomBandeiraAcionada: "Amarela", VlrAdicionalBandeiraRSMWh: ",00" },
                        ],
                    },
                }),
                { status: 200 },
            )
        })
        vi.stubGlobal("fetch", fetchMock)

        const source = new AneelTariffFlagSource()

        await expect(source.fetchCurrent()).rejects.toThrow(TariffFlagSourceError)
    })

    it("lança TariffFlagSourceError quando a bandeira retornada é desconhecida", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes(ACIONAMENTO_RESOURCE_ID)) {
                return new Response(
                    JSON.stringify({
                        success: true,
                        result: {
                            records: [{ DatCompetencia: "2021-09-01", NomBandeiraAcionada: "Escassez Hídrica" }],
                        },
                    }),
                    { status: 200 },
                )
            }
            return mockFetchImplementation(url)
        })
        vi.stubGlobal("fetch", fetchMock)

        const source = new AneelTariffFlagSource()

        await expect(source.fetchCurrent()).rejects.toThrow(TariffFlagSourceError)
    })

    it("lança TariffFlagSourceError quando falta o valor vigente de alguma modalidade", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes(ACIONAMENTO_RESOURCE_ID)) return mockFetchImplementation(url)
            return new Response(
                JSON.stringify({
                    success: true,
                    result: {
                        records: [
                            { DatVigencia: "2024-04-01", NomBandeiraAcionada: "Amarela", VlrAdicionalBandeiraRSMWh: "18,85" },
                            // Faltam Vermelha P1 e Vermelha P2.
                        ],
                    },
                }),
                { status: 200 },
            )
        })
        vi.stubGlobal("fetch", fetchMock)

        const source = new AneelTariffFlagSource()

        await expect(source.fetchCurrent()).rejects.toThrow(TariffFlagSourceError)
    })
})
