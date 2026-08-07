import { useState } from "react"
import type { ReadingPayload } from "@/lib/sse/appStream"

/** Ponto do buffer local de potência ao vivo. */
export interface PowerHistoryPoint {
    t: number
    kw: number
}

/** Maior janela suportada pelo toggle do gráfico — pontos mais velhos que
 * isso são descartados do buffer. */
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Acumula as leituras SSE de um medidor num buffer local em memória —
 * não existe endpoint de granularidade menor que hora nem histórico no SSE
 * (`readingsByMeterId` só guarda a última leitura por medidor), então o
 * gráfico de "consumo em tempo real" só pode nascer vazio e crescer
 * enquanto a página fica aberta recebendo eventos novos.
 *
 * Um ponto por `receivedAt` novo (evita duplicar em re-renders que não
 * trazem leitura nova); poda pontos com mais de 24h a cada leitura.
 *
 * Compara `receivedAt` contra estado (não `useRef`) e ajusta durante o
 * render — o compilador do React (`react-hooks/refs`) proíbe ler/escrever
 * ref no corpo do render; `setState` condicional aqui é o padrão
 * recomendado para "ajustar estado a partir de uma prop que mudou" sem o
 * flash de um efeito rodando um render depois.
 */
export const usePowerHistory = (reading: ReadingPayload | undefined): PowerHistoryPoint[] => {
    const [history, setHistory] = useState<PowerHistoryPoint[]>([])
    const [lastReceivedAt, setLastReceivedAt] = useState<string | undefined>(undefined)

    if (reading && reading.receivedAt !== lastReceivedAt) {
        setLastReceivedAt(reading.receivedAt)
        const t = new Date(reading.receivedAt).getTime()
        const kw = reading.powerW / 1000
        setHistory((prev) => {
            const cutoff = t - MAX_WINDOW_MS
            const pruned = prev.filter((point) => point.t >= cutoff)
            return [...pruned, { t, kw }]
        })
    }

    return history
}
