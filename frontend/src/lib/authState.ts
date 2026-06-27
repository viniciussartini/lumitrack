// Flag de sessão em memória, sincronizada pelo AuthContext sempre que
// `user` muda de null <-> não-null. Substitui a heurística antiga de
// "tinha token no storage" (não funciona mais — o cookie de sessão é
// httpOnly, invisível para JS) para o interceptor de 401 de `api.ts`
// decidir se uma resposta 401 representa sessão expirada.
let hasSession = false

export const authState = {
    getHasSession: (): boolean => hasSession,
    setHasSession: (value: boolean): void => {
        hasSession = value
    },
}
