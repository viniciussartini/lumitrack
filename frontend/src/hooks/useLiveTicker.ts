import { useEffect, useState } from "react"

const LIVE_KWH_MIN = 2.4
const LIVE_KWH_MAX = 4.6
const LIVE_KWH_INITIAL = 3.42
const LIVE_COST_PER_KWH = 0.638
const TICK_INTERVAL_MS = 1500

interface UseLiveTickerResult {
    kwh: number
    cost: number
}

/**
 * Random-walk ilustrativo de "potência agora" — mesmo `Component.state` +
 * `setInterval` 1500ms de `LumiTrack Landing.dc.html`. NÃO é dado real:
 * usado em telas sem sessão/medidor (Landing, painel de marca do Login) só
 * porque o handoff especifica os números variando, não um valor estático.
 * Extraído de `LandingPage.tsx` quando o Login virou o 2º consumidor real.
 */
export const useLiveTicker = (): UseLiveTickerResult => {
    const [kwh, setKwh] = useState(LIVE_KWH_INITIAL)

    useEffect(() => {
        const timer = setInterval(() => {
            setKwh((prev) =>
                Math.max(
                    LIVE_KWH_MIN,
                    Math.min(LIVE_KWH_MAX, prev + (Math.random() - 0.46) * 0.18),
                ),
            )
        }, TICK_INTERVAL_MS)
        return () => clearInterval(timer)
    }, [])

    return { kwh, cost: kwh * LIVE_COST_PER_KWH }
}
