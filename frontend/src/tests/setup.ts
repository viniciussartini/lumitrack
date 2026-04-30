import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

/**
 * jsdom não implementa window.matchMedia. Sem este mock, qualquer
 * componente que consulte prefers-color-scheme (ThemeContext, etc.)
 * lança erro no momento da renderização.
 *
 * O default retorna matches: false (= prefers-light). Testes que
 * precisam simular OS em dark mode devem sobrescrever esta implementação
 * com vi.spyOn(window, "matchMedia").
 */
const createMatchMediaMock = (matches: boolean) =>
    vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),    // deprecated, mantido por compat
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }))

Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: createMatchMediaMock(false),
})

afterEach(() => {
    cleanup()
    // Restaura o mock padrão entre testes — evita vazar overrides
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: createMatchMediaMock(false),
    })
    // Limpa storage entre testes pra não vazar tema persistido
    localStorage.clear()
})