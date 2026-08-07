import { useEffect, type RefObject } from "react"

/**
 * Dispara `handler` quando o usuário clica fora do elemento referenciado.
 *
 * IMPORTANTE: o ref deve apontar para o CONTAINER que inclui o trigger
 * (ex: o botão que abre um dropdown) e o conteúdo aberto (ex: o menu).
 * Se aponta só para o conteúdo, o click no trigger é considerado "fora",
 * causando o bug de "abre e fecha imediatamente".
 *
 * Escuta tanto mousedown quanto touchstart para cobrir mouse e touch.
 */
export const useClickOutside = <T extends HTMLElement>(
    ref: RefObject<T | null>,
    handler: (event: MouseEvent | TouchEvent) => void,
): void => {
    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node | null
            if (!ref.current || !target || ref.current.contains(target)) {
                return
            }
            handler(event)
        }

        document.addEventListener("mousedown", listener)
        document.addEventListener("touchstart", listener)

        return () => {
            document.removeEventListener("mousedown", listener)
            document.removeEventListener("touchstart", listener)
        }
    }, [ref, handler])
}
