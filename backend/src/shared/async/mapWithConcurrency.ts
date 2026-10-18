/**
 * `Array.map` assíncrono com no máximo `limit` chamadas em andamento, mantendo
 * a ordem do resultado. Serve a lotes em que cada item abre várias conexões
 * ao banco: disparar todos de uma vez estoura o pool e os itens do fim da fila
 * falham por espera de conexão, e fazer um de cada vez deixa o lote lento.
 * A primeira falha rejeita a chamada e nenhum worker pega item novo depois dela;
 * as chamadas que já estavam em andamento terminam sozinhas.
 *
 * @param items - Itens a processar.
 * @param limit - Máximo de chamadas simultâneas (mínimo 1).
 * @param fn - Função assíncrona aplicada a cada item.
 * @returns Os resultados na ordem dos itens.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length)
    let next = 0
    let failed = false

    const worker = async (): Promise<void> => {
        while (!failed && next < items.length) {
            const index = next++
            try {
                results[index] = await fn(items[index]!, index)
            } catch (err) {
                failed = true
                throw err
            }
        }
    }

    const workerCount = Math.min(Math.max(1, limit), items.length)
    await Promise.all(Array.from({ length: workerCount }, worker))
    return results
}
