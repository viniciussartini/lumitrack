import { describe, it, expect } from "vitest"
import { slugify } from "@/lib/slugify"

describe("slugify", () => {
    it("minúsculiza e troca espaços por hífen", () => {
        expect(slugify("Para quem é")).toBe("para-quem-e")
    })

    it("remove acentos", () => {
        expect(slugify("Política de Privacidade")).toBe("politica-de-privacidade")
    })

    it("remove pontuação e não deixa hífen nas pontas", () => {
        expect(slugify("O que é?")).toBe("o-que-e")
    })
})
