import { useEffect, useState } from "react"
import { useRealtime } from "@/contexts/RealtimeContext"
import type { ReadingPayload } from "@/lib/sse/appStream"

/** Leitura considerada "obsoleta" após esse tempo sem uma amostra nova —
 * mesmo limiar que o antigo RealTimeCard usava. */
const STALE_THRESHOLD_MS = 10_000

interface UseLiveMeterReadingResult {
    reading: ReadingPayload | undefined
    isStale: boolean
}

const computeIsStale = (reading: ReadingPayload | undefined): boolean =>
    !reading || Date.now() - new Date(reading.receivedAt).getTime() > STALE_THRESHOLD_MS

/**
 * Última leitura SSE de um medidor + status de "obsoleta" (sem amostra nova
 * há mais de `STALE_THRESHOLD_MS`). Extraído de `MeterSection`/
 * `PropertyDetailsPage`, que duplicavam a mesma lógica — 3º consumidor real
 * (`RealtimeSection`, Painel) justifica a extração.
 */
export const useLiveMeterReading = (meterId: string | undefined): UseLiveMeterReadingResult => {
    const { readingsByMeterId } = useRealtime()
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

    return { reading, isStale }
}
