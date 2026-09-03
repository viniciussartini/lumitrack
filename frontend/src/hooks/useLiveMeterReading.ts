import { useEffect, useState } from "react"
import { useRealtimeReadings } from "@/contexts/RealtimeContext"
import { useLatestMeterReading } from "@/hooks/queries/useLatestMeterReading"
import type { ReadingPayload } from "@/lib/sse/appStream"
import type { TargetType } from "@/types/meter.types"

/** Leitura considerada "obsoleta" após esse tempo sem uma amostra nova —
 * mesmo limiar que o antigo RealTimeCard usava. */
const STALE_THRESHOLD_MS = 10_000

interface UseLiveMeterReadingResult {
    reading: ReadingPayload | undefined
    isStale: boolean
    /**
     * Melhor potência conhecida agora, por ordem de prioridade: (1) leitura
     * SSE fresca; (2) fallback REST (último balde por minuto já persistido);
     * (3) leitura SSE obsoleta, se o REST ainda não respondeu — mostrar um
     * valor com minutos de idade é melhor que apagar um valor que já
     * existia na tela. `undefined` só quando as três fontes faltam (alvo
     * sem NENHUMA leitura ainda, nem SSE nem persistida). Tensão/corrente/
     * fator de potência não têm equivalente — só existem na amostra
     * instantânea do SSE, nunca no agregado por minuto.
     */
    lastKnownPowerW: number | undefined
}

const computeIsStale = (reading: ReadingPayload | undefined): boolean =>
    !reading || Date.now() - new Date(reading.receivedAt).getTime() > STALE_THRESHOLD_MS

/**
 * Última leitura SSE de um medidor + status de "obsoleta" (sem amostra nova
 * há mais de `STALE_THRESHOLD_MS`), com fallback REST de potência quando o
 * SSE ainda não entregou nenhuma leitura deste medidor (aba recém-aberta,
 * medidor que demora a reportar) — sem isso, os cards de potência ficavam em
 * "—" indefinidamente mesmo com leituras recentes já persistidas.
 */
export const useLiveMeterReading = (
    targetType: TargetType,
    targetId: string | undefined,
    meterId: string | undefined,
): UseLiveMeterReadingResult => {
    const { readingsByMeterId } = useRealtimeReadings()
    const reading = meterId ? readingsByMeterId[meterId] : undefined

    const [isStale, setIsStale] = useState(() => computeIsStale(reading))

    // `isStale` precisa ser estado de verdade, não uma expressão calculada a
    // partir de `Date.now()` no corpo do render: o React Compiler memoiza
    // expressões puras por dependência de props/state, e `Date.now()` muda
    // por fora disso — uma leitura direta do relógio aqui seria memoizada
    // erroneamente e nunca se atualizaria sozinha.
    //
    // Uma leitura NOVA precisa refletir "fresca" já neste render, não só no
    // próximo — por isso o ajuste roda aqui (padrão de "ajustar estado
    // durante o render quando uma prop muda"), não dentro do efeito abaixo.
    const [prevReading, setPrevReading] = useState(reading)
    if (reading !== prevReading) {
        setPrevReading(reading)
        setIsStale(computeIsStale(reading))
    }

    // O efeito só cuida do FUTURO: agenda a transição para "obsoleta" no
    // instante exato em que ela aconteceria, em vez de reamostrar a cada N
    // segundos. Reagenda sozinho sempre que chega uma leitura NOVA deste
    // medidor (`reading` só muda de referência quando é a entrada dele que
    // foi atualizada no contexto).
    useEffect(() => {
        if (!reading) return

        // +1ms: `computeIsStale` só vira `true` quando o tempo decorrido
        // ultrapassa `STALE_THRESHOLD_MS` (`>`, não `>=`) — agendar exatamente
        // em cima do limiar dispararia um render que ainda leria `isStale`
        // como falso.
        const msUntilStale =
            new Date(reading.receivedAt).getTime() + STALE_THRESHOLD_MS - Date.now() + 1
        if (msUntilStale <= 0) return

        const timer = setTimeout(() => setIsStale(true), msUntilStale)
        return () => clearTimeout(timer)
    }, [reading])

    // Só busca via REST enquanto o SSE não tem nada fresco pra oferecer —
    // some sozinho (query desabilitada) assim que uma leitura real chega, e
    // volta a rodar se a conexão cair depois. Sem medidor vinculado, nem
    // dispara (a query já se desabilita sozinha por dentro).
    const needsFallback = isStale
    const fallbackQuery = useLatestMeterReading(targetType, targetId, meterId, needsFallback)
    const lastKnownPowerW =
        !isStale && reading ? reading.powerW : (fallbackQuery.data ?? reading?.powerW)

    return { reading, isStale, lastKnownPowerW }
}
