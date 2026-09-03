import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * A escala de fonte do Industry (`styles/industry.css`, `--text-10` a
 * `--text-44`) usa sufixos puramente numéricos: `text-19`, `text-12-5`.
 * Sem esta extensão, o tailwind-merge não reconhece esses sufixos como
 * tamanho de fonte — sua heurística padrão trata qualquer sufixo de
 * `text-` que não bate com o tamanho/cor conhecidos do Tailwind como um
 * possível nome de cor customizado, e descarta a classe de cor anterior
 * por achar que as duas definem a mesma propriedade (`cn("text-white",
 * "text-19")` virava só `"text-19"`, cor perdida).
 */
const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            text: [(value: string) => /^\d+(-\d+)?$/.test(value)],
        },
    },
})

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
