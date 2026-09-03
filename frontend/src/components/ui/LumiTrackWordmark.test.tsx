import { describe, it, expect } from "vitest"
import { render, screen } from "@/tests/test-utils"
import { LumiTrackWordmark } from "@/components/ui/LumiTrackWordmark"

describe("LumiTrackWordmark — variante dark (Login, Registro, Sidebar)", () => {
    it("renderiza 'Lumi' em branco puro", () => {
        render(<LumiTrackWordmark />)

        const lumiSpan = screen.getByText("Track").parentElement!

        expect(lumiSpan).toHaveClass("text-white")
    })

    it("renderiza 'Track' com o mesmo gradiente do ícone da logo", () => {
        render(<LumiTrackWordmark />)

        const track = screen.getByText("Track")

        expect(track).toHaveClass("from-[#5980A6]", "via-[#96B18F]", "to-[#D4E277]")
    })

    it("mantém 'Lumi' branco mesmo com textClassName do tamanho de fonte do Industry (uso real do BrandPanel/Sidebar)", () => {
        // Regressão: `text-19`/`text-20` (styles/industry.css) e `text-white`
        // são ambos prefixados por "text-" — sem a extensão de tema em
        // `lib/cn.ts`, o tailwind-merge classificava os dois como a mesma
        // propriedade (cor) e descartava `text-white`.
        render(<LumiTrackWordmark textClassName="text-19" />)

        const lumiSpan = screen.getByText("Track").parentElement!

        expect(lumiSpan).toHaveClass("text-white", "text-19")
    })
})

describe("LumiTrackWordmark — variante light (páginas legais)", () => {
    it("mantém 'Track' com o gradiente do ícone (inalterado)", () => {
        render(<LumiTrackWordmark variant="light" />)

        const track = screen.getByText("Track")

        expect(track).toHaveClass("from-[#5980A6]", "via-[#96B18F]", "to-[#D4E277]")
    })
})
