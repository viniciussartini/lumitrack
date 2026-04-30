import { describe, it, expect, beforeEach, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@/tests/test-utils"
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext"
import { storage, STORAGE_KEYS } from "@/lib/storage"

// ─────────────────────────────────────────────────────────────────────────────
// Tipos / Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface FakeMediaQueryList {
    matches: boolean
    media: string
    onchange: null
    addListener: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
    dispatchEvent: ReturnType<typeof vi.fn>
    __triggerChange: (matches: boolean) => void
}

/**
 * Simula o que o OS está reportando para prefers-color-scheme.
 * Use ANTES de renderizar o Provider — o Provider lê matchMedia no boot.
 *
 * Retorna o fake MQL para que testes de reactivity possam disparar
 * mudanças de OS via __triggerChange.
 */
const setOsPrefersDark = (prefersDark: boolean): FakeMediaQueryList => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>()

    const mediaQueryList: FakeMediaQueryList = {
        matches: prefersDark,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(
            (_: string, listener: (e: MediaQueryListEvent) => void) => {
                listeners.add(listener)
            },
        ),
        removeEventListener: vi.fn(
            (_: string, listener: (e: MediaQueryListEvent) => void) => {
                listeners.delete(listener)
            },
        ),
        dispatchEvent: vi.fn(),
        __triggerChange: (matches: boolean) => {
            const event = { matches } as MediaQueryListEvent
            listeners.forEach((l) => l(event))
        },
    }

    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: vi.fn(() => mediaQueryList),
    })

    return mediaQueryList
}

/** Componente sonda para inspecionar o context dentro de um render */
const ThemeProbe = () => {
    const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
    return (
        <div>
            <span data-testid="theme">{theme}</span>
            <span data-testid="resolved">{resolvedTheme}</span>
            <button onClick={() => setTheme("light")}>set-light</button>
            <button onClick={() => setTheme("dark")}>set-dark</button>
            <button onClick={() => setTheme("system")}>set-system</button>
            <button onClick={toggleTheme}>toggle</button>
        </div>
    )
}

beforeEach(() => {
    document.documentElement.classList.remove("dark")
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: Boot / inicialização
// ─────────────────────────────────────────────────────────────────────────────

describe("ThemeProvider — boot", () => {
    it("usa 'system' como padrão quando não há nada no storage", () => {
        setOsPrefersDark(false)

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        expect(screen.getByTestId("theme").textContent).toBe("system")
        expect(screen.getByTestId("resolved").textContent).toBe("light")
    })

    it("respeita 'light' salvo no storage", () => {
        storage.set(STORAGE_KEYS.THEME, "light")
        setOsPrefersDark(true) // OS pede dark, mas user pediu light explícito

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        expect(screen.getByTestId("theme").textContent).toBe("light")
        expect(screen.getByTestId("resolved").textContent).toBe("light")
    })

    it("respeita 'dark' salvo no storage", () => {
        storage.set(STORAGE_KEYS.THEME, "dark")
        setOsPrefersDark(false)

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        expect(screen.getByTestId("theme").textContent).toBe("dark")
        expect(screen.getByTestId("resolved").textContent).toBe("dark")
    })

    it("em 'system', resolve para 'dark' quando OS prefere dark", () => {
        storage.set(STORAGE_KEYS.THEME, "system")
        setOsPrefersDark(true)

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        expect(screen.getByTestId("theme").textContent).toBe("system")
        expect(screen.getByTestId("resolved").textContent).toBe("dark")
    })

    it("trata valor inválido no storage como 'system'", () => {
        localStorage.setItem(STORAGE_KEYS.THEME, "purple-elephant")
        setOsPrefersDark(false)

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        expect(screen.getByTestId("theme").textContent).toBe("system")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: Aplicação no DOM
// ─────────────────────────────────────────────────────────────────────────────

describe("ThemeProvider — DOM", () => {
    it("adiciona a classe .dark em <html> quando resolvedTheme é dark", () => {
        storage.set(STORAGE_KEYS.THEME, "dark")
        setOsPrefersDark(false)

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        expect(document.documentElement.classList.contains("dark")).toBe(true)
    })

    it("remove a classe .dark de <html> quando resolvedTheme é light", () => {
        document.documentElement.classList.add("dark") // simula estado prévio
        storage.set(STORAGE_KEYS.THEME, "light")

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        expect(document.documentElement.classList.contains("dark")).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: setTheme
// ─────────────────────────────────────────────────────────────────────────────

describe("ThemeProvider — setTheme", () => {
    it("setTheme('dark') atualiza estado, DOM e storage", async () => {
        const user = userEvent.setup()
        setOsPrefersDark(false)

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        await user.click(screen.getByText("set-dark"))

        expect(screen.getByTestId("theme").textContent).toBe("dark")
        expect(screen.getByTestId("resolved").textContent).toBe("dark")
        expect(document.documentElement.classList.contains("dark")).toBe(true)
        expect(storage.get(STORAGE_KEYS.THEME)).toBe("dark")
    })

    it("setTheme('light') volta o estado coerente", async () => {
        storage.set(STORAGE_KEYS.THEME, "dark")
        const user = userEvent.setup()

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        await user.click(screen.getByText("set-light"))

        expect(screen.getByTestId("theme").textContent).toBe("light")
        expect(document.documentElement.classList.contains("dark")).toBe(false)
        expect(storage.get(STORAGE_KEYS.THEME)).toBe("light")
    })

    it("setTheme('system') re-resolve a partir do OS", async () => {
        storage.set(STORAGE_KEYS.THEME, "light")
        setOsPrefersDark(true) // OS = dark
        const user = userEvent.setup()

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        await user.click(screen.getByText("set-system"))

        expect(screen.getByTestId("theme").textContent).toBe("system")
        expect(screen.getByTestId("resolved").textContent).toBe("dark")
        expect(storage.get(STORAGE_KEYS.THEME)).toBe("system")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: toggleTheme
// ─────────────────────────────────────────────────────────────────────────────

describe("ThemeProvider — toggleTheme", () => {
    it("alterna de light para dark", async () => {
        storage.set(STORAGE_KEYS.THEME, "light")
        const user = userEvent.setup()

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        await user.click(screen.getByText("toggle"))

        expect(screen.getByTestId("theme").textContent).toBe("dark")
        expect(screen.getByTestId("resolved").textContent).toBe("dark")
    })

    it("alterna de dark para light", async () => {
        storage.set(STORAGE_KEYS.THEME, "dark")
        const user = userEvent.setup()

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        await user.click(screen.getByText("toggle"))

        expect(screen.getByTestId("theme").textContent).toBe("light")
    })

    it("partindo de system+light vai para dark explícito", async () => {
        storage.set(STORAGE_KEYS.THEME, "system")
        setOsPrefersDark(false) // OS = light → resolved = light
        const user = userEvent.setup()

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        await user.click(screen.getByText("toggle"))

        expect(screen.getByTestId("theme").textContent).toBe("dark")
        expect(storage.get(STORAGE_KEYS.THEME)).toBe("dark")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: Reactivity ao OS
// ─────────────────────────────────────────────────────────────────────────────

describe("ThemeProvider — reactivity ao OS", () => {
    it("em 'system', resolvedTheme atualiza quando o OS muda", () => {
        storage.set(STORAGE_KEYS.THEME, "system")
        const mql = setOsPrefersDark(false)

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        expect(screen.getByTestId("resolved").textContent).toBe("light")

        act(() => {
            mql.__triggerChange(true)
        })

        expect(screen.getByTestId("resolved").textContent).toBe("dark")
    })

    it("em modo explícito, mudança do OS é ignorada", () => {
        storage.set(STORAGE_KEYS.THEME, "light")
        const mql = setOsPrefersDark(false)

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>,
        )

        act(() => {
            mql.__triggerChange(true)
        })

        expect(screen.getByTestId("resolved").textContent).toBe("light")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: useTheme (hook)
// ─────────────────────────────────────────────────────────────────────────────

describe("useTheme", () => {
    it("lança erro quando usado fora do ThemeProvider", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)

        expect(() => renderHook(() => useTheme())).toThrow(
            /useTheme deve ser usado dentro de <ThemeProvider>/,
        )

        spy.mockRestore()
    })
})