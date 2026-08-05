import { TariffFlag } from "@/generated/prisma/client.js"
import type { ITariffFlagSource, TariffFlagSnapshot } from "@/modules/tariff-flag/sync/ITariffFlagSource.js"
import {
    acionamentoResponseSchema,
    adicionalResponseSchema,
    type AdicionalRecord,
} from "@/modules/tariff-flag/sync/aneel-response.schema.js"
import { logger } from "@/shared/logger/logger.js"

const log = logger.child({ module: "AneelTariffFlagSource" })

// Portal de Dados Abertos da ANEEL (dataset "Bandeiras Tarifárias") — ver
// ADR-0007 (.claude/docs/adr/0007-bandeira-tarifaria-fonte-oficial-aneel.md)
// para a investigação completa. API DataStore do CKAN, pública, sem
// credencial.
const ANEEL_API_BASE_URL = "https://dadosabertos.aneel.gov.br/api/3/action/datastore_search"

// resource_id do recurso "Bandeira Tarifária - Acionamento" — mensal, dá a
// bandeira ativa em cada competência.
const ACIONAMENTO_RESOURCE_ID = "0591b8f6-fe54-437b-b72b-1aa2efd46e42"
// resource_id do recurso "Bandeira Tarifária - Adicional" — por Resolução
// Homologatória, dá o valor de cada modalidade não-verde.
const ADICIONAL_RESOURCE_ID = "5879ca80-b3bd-45b1-a135-d9b77c1d5b36"

// Generoso o bastante para trazer o dataset inteiro numa chamada só (~140
// linhas no "Acionamento", ~30 no "Adicional" em 2026) — evita depender do
// parâmetro `sort` da API (instável em teste manual) fazendo a ordenação
// no cliente.
const FETCH_LIMIT = 1000
const REQUEST_TIMEOUT_MS = 8000
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 500

const FLAG_NAME_MAP: Record<string, TariffFlag> = {
    Verde: TariffFlag.GREEN,
    Amarela: TariffFlag.YELLOW,
    "Vermelha P1": TariffFlag.RED_P1,
    "Vermelha P2": TariffFlag.RED_P2,
}

// Modalidades cujo valor vem do recurso "Adicional" — Verde nunca aparece
// lá (não tem acréscimo, valor implícito 0).
const NON_GREEN_FLAG_NAMES = ["Amarela", "Vermelha P1", "Vermelha P2"] as const

export class TariffFlagSourceError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = "TariffFlagSourceError"
    }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson(resourceId: string): Promise<unknown> {
    const url = `${ANEEL_API_BASE_URL}?resource_id=${resourceId}&limit=${FETCH_LIMIT}`

    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

        try {
            const response = await fetch(url, { signal: controller.signal })

            if (!response.ok) {
                throw new TariffFlagSourceError(
                    `ANEEL respondeu ${response.status} para o recurso ${resourceId}`,
                )
            }

            return await response.json()
        } catch (err) {
            lastError = err
            log.warn({ err, resourceId, attempt }, "Falha ao consultar a API da ANEEL")

            if (attempt < MAX_ATTEMPTS) {
                await sleep(RETRY_DELAY_MS)
            }
        } finally {
            clearTimeout(timeout)
        }
    }

    throw new TariffFlagSourceError(
        `Não foi possível obter o recurso ${resourceId} da ANEEL após ${MAX_ATTEMPTS} tentativa(s)`,
        { cause: lastError },
    )
}

function resolveFlag(nomBandeira: string): TariffFlag {
    const flag = FLAG_NAME_MAP[nomBandeira]

    if (!flag) {
        throw new TariffFlagSourceError(
            `Bandeira desconhecida retornada pela ANEEL: "${nomBandeira}"`,
        )
    }

    return flag
}

// Linha de vigência mais recente (≤ agora) para uma modalidade — nunca
// aplica uma resolução que ainda não entrou em vigor.
function mostRecentValue(records: AdicionalRecord[], nomBandeira: string): number {
    const now = new Date().toISOString().slice(0, 10)

    const candidates = records.filter(
        (record) => record.NomBandeiraAcionada === nomBandeira && record.DatVigencia.slice(0, 10) <= now,
    )

    if (candidates.length === 0) {
        throw new TariffFlagSourceError(
            `Nenhum valor vigente encontrado para a modalidade "${nomBandeira}" no recurso "Adicional"`,
        )
    }

    const latest = candidates.reduce((max, record) => (record.DatVigencia > max.DatVigencia ? record : max))

    // Fonte é R$/MWh; o schema usa R$/100kWh (1 MWh = 10 × 100kWh) —
    // verificado no ADR-0007 contra os valores já semeados em seed.ts.
    // Arredondado a 4 casas (mesma precisão de TariffFlagConfig,
    // Decimal(10,4)) para não carregar erro de ponto flutuante da divisão.
    return Math.round((latest.VlrAdicionalBandeiraRSMWh / 10) * 10000) / 10000
}

/**
 * Fonte oficial da bandeira tarifária vigente — Portal de Dados Abertos da
 * ANEEL (ver ADR-0007). Combina 2 recursos do dataset "Bandeiras
 * Tarifárias": "Acionamento" (mensal, dá a bandeira ativa) e "Adicional"
 * (por Resolução Homologatória, dá os 3 valores não-verde). Lança
 * `TariffFlagSourceError` em qualquer falha — nunca retorna um snapshot
 * parcial ou adivinhado; falha fechada é responsabilidade de quem chama.
 */
export class AneelTariffFlagSource implements ITariffFlagSource {
    async fetchCurrent(): Promise<TariffFlagSnapshot> {
        // Sequencial, não Promise.all — é um job de background diário (não
        // serve request de usuário), então a diferença de latência não
        // importa, e evita 2 chamadas concorrentes com retry cada uma.
        const acionamentoRaw = await fetchJson(ACIONAMENTO_RESOURCE_ID)
        const adicionalRaw = await fetchJson(ADICIONAL_RESOURCE_ID)

        const acionamentoParsed = acionamentoResponseSchema.safeParse(acionamentoRaw)
        if (!acionamentoParsed.success) {
            throw new TariffFlagSourceError(
                "Payload inesperado da ANEEL para o recurso \"Acionamento\"",
                { cause: acionamentoParsed.error },
            )
        }

        const adicionalParsed = adicionalResponseSchema.safeParse(adicionalRaw)
        if (!adicionalParsed.success) {
            throw new TariffFlagSourceError(
                "Payload inesperado da ANEEL para o recurso \"Adicional\"",
                { cause: adicionalParsed.error },
            )
        }

        const acionamentoRecords = acionamentoParsed.data.result.records
        if (acionamentoRecords.length === 0) {
            throw new TariffFlagSourceError("Recurso \"Acionamento\" da ANEEL retornou vazio")
        }

        const currentMonth = acionamentoRecords.reduce((max, record) =>
            record.DatCompetencia > max.DatCompetencia ? record : max,
        )
        const flag = resolveFlag(currentMonth.NomBandeiraAcionada)

        const adicionalRecords = adicionalParsed.data.result.records
        const [yellowPer100Kwh, redP1Per100Kwh, redP2Per100Kwh] = NON_GREEN_FLAG_NAMES.map((name) =>
            mostRecentValue(adicionalRecords, name),
        ) as [number, number, number]

        return {
            flag,
            greenPer100Kwh: 0,
            yellowPer100Kwh,
            redP1Per100Kwh,
            redP2Per100Kwh,
        }
    }
}
