import { describe, it, expect } from "vitest"
import { cn } from "@/lib/cn"

describe("cn — mescla de classes de tamanho de texto do Industry com cor", () => {
    it("não descarta a cor do texto ao combinar com um tamanho custom do Industry (text-19/text-20/text-12-5)", () => {
        // A escala de fonte do Industry (styles/industry.css, --text-10..--text-44)
        // usa sufixos puramente numéricos ("text-19", "text-12-5"). Sem o
        // tailwind-merge saber que esses sufixos são tamanho de fonte, a
        // heurística padrão dele trata qualquer sufixo desconhecido de
        // "text-" como possível nome de cor — e descarta "text-white" por
        // achar que os dois definem a mesma propriedade.
        expect(cn("text-white", "text-19")).toBe("text-white text-19")
        expect(cn("text-white", "text-20")).toBe("text-white text-20")
        expect(cn("text-white", "text-12-5")).toBe("text-white text-12-5")
        expect(cn("text-19", "text-white")).toBe("text-19 text-white")
    })

    it("continua resolvendo conflito real de cor de texto (a última classe vence)", () => {
        expect(cn("text-white", "text-red-500")).toBe("text-red-500")
    })

    it("continua resolvendo conflito real de tamanho de fonte do Industry (a última classe vence)", () => {
        expect(cn("text-19", "text-20")).toBe("text-20")
    })
})
