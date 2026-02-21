import { createApp } from "@/app.js"
import { env } from "@/config/env.js"

const app = createApp()

const server = app.listen(env.PORT, () => {
    console.log(`LumiTrack API rodando em http://localhost:${env.PORT}`)
    console.log(`Ambiente: ${env.NODE_ENV}`)
    console.log(`Health: http://localhost:${env.PORT}/health`)
})

// Graceful shutdown — garante que conexões abertas sejam finalizadas
// antes de encerrar o processo (importante em produção com PM2/Docker).
function shutdown(signal: string) {
    console.log(`\n⚡ Sinal ${signal} recebido. Encerrando servidor...`)
    server.close(() => {
        console.log("Servidor encerrado com sucesso.")
        process.exit(0)
    })
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))