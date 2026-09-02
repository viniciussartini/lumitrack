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
})

describe("LumiTrackWordmark — variante light (páginas legais)", () => {
    it("mantém 'Track' com o gradiente do ícone (inalterado)", () => {
        render(<LumiTrackWordmark variant="light" />)

        const track = screen.getByText("Track")

        expect(track).toHaveClass("from-[#5980A6]", "via-[#96B18F]", "to-[#D4E277]")
    })
})
