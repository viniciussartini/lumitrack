import { describe, it, expect } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@/tests/test-utils"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { storage, STORAGE_KEYS } from "@/lib/storage"

const renderToggle = () =>
    render(
        <ThemeProvider>
            <ThemeToggle />
        </ThemeProvider>,
    )

describe("ThemeToggle — renderização", () => {
    it("é um botão acessível com aria-label refletindo o tema atual", () => {
        storage.set(STORAGE_KEYS.THEME, "light")
        renderToggle()

        const button = screen.getByRole("button", { name: /tema atual: claro/i })
        expect(button).toBeInTheDocument()
    })

    it("aria-label muda quando o tema é dark", () => {
        storage.set(STORAGE_KEYS.THEME, "dark")
        renderToggle()

        expect(screen.getByRole("button", { name: /tema atual: escuro/i })).toBeInTheDocument()
    })

    it("aria-label muda quando o tema é system", () => {
        storage.set(STORAGE_KEYS.THEME, "system")
        renderToggle()

        expect(screen.getByRole("button", { name: /tema atual: sistema/i })).toBeInTheDocument()
    })
})

describe("ThemeToggle — interação", () => {
    it("cicla light → dark → system → light a cada clique", async () => {
        storage.set(STORAGE_KEYS.THEME, "light")
        const user = userEvent.setup()
        renderToggle()

        const button = screen.getByRole("button")

        // light → dark
        await user.click(button)
        expect(button).toHaveAccessibleName(/tema atual: escuro/i)
        expect(storage.get(STORAGE_KEYS.THEME)).toBe("dark")

        // dark → system
        await user.click(button)
        expect(button).toHaveAccessibleName(/tema atual: sistema/i)
        expect(storage.get(STORAGE_KEYS.THEME)).toBe("system")

        // system → light
        await user.click(button)
        expect(button).toHaveAccessibleName(/tema atual: claro/i)
        expect(storage.get(STORAGE_KEYS.THEME)).toBe("light")
    })
})
