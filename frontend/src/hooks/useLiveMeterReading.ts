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

/**
 * Última leitura SSE de um medidor + status de "obsoleta" (sem amostra nova
 * há mais de `STALE_THRESHOLD_MS`). Extraído de `MeterSection`/
 * `PropertyDetailsPage`, que duplicavam a mesma lógica — 3º consumidor real
 * (`RealtimeSection`, Painel) justifica a extração.
 */
export const useLiveMeterReading = (
    meterId: string | undefined,
): UseLiveMeterReadingResult => {
    const { readingsByMeterId } = useRealtime()
    const [now, setNow] = useState(() => Date.now())

    // Recalcula a "idade" da leitura periodicamente — sem isso, o status só
    // re-renderizaria quando uma leitura NOVA chegasse, e nunca detectaria
    // sozinho que o medidor parou de transmitir.
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 2_000)
        return () => clearInterval(interval)
    }, [])

    const reading = meterId ? readingsByMeterId[meterId] : undefined
    const isStale =
        !reading || now - new Date(reading.receivedAt).getTime() > STALE_THRESHOLD_MS

    return { reading, isStale }
}
