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

        expect(track).toHaveClass("from-accent", "via-brand-gradient-mid", "to-brand-gradient-end")
    })

    it("mantém 'Lumi' branco mesmo com textClassName do tamanho de fonte do Industry (uso real do BrandPanel/Sidebar)", () => {
        // `text-19` (tamanho de fonte, styles/industry.css) e `text-white`
        // (cor) são ambos prefixados por "text-" mas não conflitam: a
        // extensão de tema em `lib/cn.ts` garante que o tailwind-merge trata
        // os dois como propriedades diferentes.
        render(<LumiTrackWordmark textClassName="text-19" />)

        const lumiSpan = screen.getByText("Track").parentElement!

        expect(lumiSpan).toHaveClass("text-white", "text-19")
    })
})

describe("LumiTrackWordmark — variante light (páginas legais)", () => {
    it("mantém 'Track' com o gradiente do ícone (inalterado)", () => {
        render(<LumiTrackWordmark variant="light" />)

        const track = screen.getByText("Track")

        expect(track).toHaveClass("from-accent", "via-brand-gradient-mid", "to-brand-gradient-end")
    })
})
