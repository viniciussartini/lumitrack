import { useEffect, useState } from "react"
import type { NetworkSnapshot } from "@/types"

export interface LiveStatus {
    networks: NetworkSnapshot[]
    connected: boolean
}

// Consome GET /api/status/stream (SSE) — o servidor reenvia o snapshot
// completo a cada mudança, então não há necessidade de merge/diff local,
// nem de polling: `networks` sempre reflete o estado atual do simulador.
//
// Usa EventSource nativo do browser (não @microsoft/fetch-event-source,
// usado no frontend principal) — este endpoint não exige headers
// customizados/credenciais, então a API nativa é suficiente e evita uma
// dependência extra para uma ferramenta interna pequena.
export function useLiveStatus(): LiveStatus {
    const [networks, setNetworks] = useState<NetworkSnapshot[]>([])
    const [connected, setConnected] = useState(false)

    useEffect(() => {
        const source = new EventSource("/api/status/stream")

        source.addEventListener("snapshot", (event) => {
            setConnected(true)
            setNetworks(JSON.parse((event as MessageEvent).data) as NetworkSnapshot[])
        })

        source.onerror = () => {
            setConnected(false)
        }

        return () => {
            source.close()
        }
    }, [])

    return { networks, connected }
}
