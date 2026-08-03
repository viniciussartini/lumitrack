// Alguns controllers (admin, export) registram o audit log DEPOIS de enviar
// a resposta HTTP, por decisão deliberada de latência (ver comentário nos
// próprios controllers) — a gravação no banco corre em paralelo ao envio da
// resposta, sem ordem garantida entre as duas. Testes que checam esse audit
// log logo após `request(app)...` resolver precisam esperar deterministicamente
// em vez de assumir que a escrita já terminou (issue #113).
export async function waitFor<T>(
    fn: () => Promise<T | null>,
    { timeoutMs = 1000, intervalMs = 20 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
    const deadline = Date.now() + timeoutMs

    for (;;) {
        const result = await fn()
        if (result !== null) return result

        if (Date.now() >= deadline) {
            throw new Error(`waitFor: timeout de ${timeoutMs}ms sem resultado não-nulo`)
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
}
