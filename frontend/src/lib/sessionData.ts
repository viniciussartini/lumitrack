import { toast } from "sonner"
import { queryClient } from "@/lib/queryClient"
import { storage, STORAGE_KEYS } from "@/lib/storage"

/**
 * Descarta o que o navegador guardou em nome do usuário anterior: o cache do
 * TanStack Query, a propriedade escolhida no Painel e os avisos ainda na tela
 * (o texto deles vem das notificações da conta anterior). As chaves de query não
 * carregam o usuário, então sem isto quem entra logo depois de outra conta vê,
 * na primeira tela, os dados dela.
 */
export const discardSessionData = (): void => {
    queryClient.clear()
    storage.remove(STORAGE_KEYS.SELECTED_PROPERTY)
    toast.dismiss()
}

/**
 * Avisa as outras abas de que o usuário da sessão mudou (entrada ou saída).
 * Todas as abas compartilham os cookies, mas cada uma tem o próprio cache e o
 * próprio usuário em memória; sem o aviso, uma aba que ficou para trás passa a
 * mostrar dados da conta nova misturados com os da antiga. O evento `storage` só
 * dispara nas outras abas, nunca na que escreveu, então o aviso não volta para
 * quem o enviou. O valor muda a cada chamada porque o evento só existe quando o
 * valor muda; ele não carrega dado do usuário.
 */
export const announceSessionChange = (): void => {
    storage.set(STORAGE_KEYS.SESSION_SIGNAL, `${Date.now()}-${Math.random()}`)
}

/**
 * Escuta o aviso de {@link announceSessionChange} vindo de outra aba.
 *
 * @param onChange - Chamado quando outra aba entrou ou saiu da sessão.
 * @returns Função que remove o ouvinte.
 */
export const onSessionChangedElsewhere = (onChange: () => void): (() => void) => {
    const listener = (event: StorageEvent): void => {
        if (event.key === STORAGE_KEYS.SESSION_SIGNAL) onChange()
    }
    window.addEventListener("storage", listener)
    return () => window.removeEventListener("storage", listener)
}
