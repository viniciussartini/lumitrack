import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { storage, STORAGE_KEYS } from "@/lib/storage"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

interface ThemeContextValue {
    theme: Theme
    resolvedTheme: ResolvedTheme
    setTheme: (theme: Theme) => void
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const isValidTheme = (value: string | null): value is Theme =>
    value === "light" || value === "dark" || value === "system"

/**
 * Pergunta ao OS qual tema ele prefere.
 * Encapsulado pra ser fácil de mockar nos testes e centralizar a query.
 */
const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === "undefined") {
        return "light"
    } // SSR safety (defensivo)

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** Resolve um Theme em um ResolvedTheme (concretiza "system") */
const resolveTheme = (theme: Theme): ResolvedTheme =>
    theme === "system" ? getSystemTheme() : theme

interface ThemeProviderProps {
    children: ReactNode
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
    // Lazy initializer — roda 1x no mount, lê localStorage e decide o estado.
    // Importante: como o script anti-FOUC no index.html já aplicou o atributo
    // data-theme antes do React montar, este estado tem que CASAR com o que o
    // script decidiu. A lógica abaixo espelha a do script.
    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = storage.get(STORAGE_KEYS.THEME)
        return isValidTheme(stored) ? stored : "system"
    })

    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
        resolveTheme(
            isValidTheme(storage.get(STORAGE_KEYS.THEME))
                ? (storage.get(STORAGE_KEYS.THEME) as Theme)
                : "system",
        ),
    )

    // Deriva resolvedTheme de "theme" de forma síncrona durante o render
    // ("ajustar estado quando uma prop/estado muda", em vez de um effect que
    // chama setState — evita a cascata de renders que o effect antigo
    // causava). Effect 3 abaixo continua sendo o responsável legítimo por
    // atualizar resolvedTheme quando o SO muda de tema com theme==="system"
    // (aí sim é reagir a um evento de um sistema externo).
    const [prevTheme, setPrevTheme] = useState(theme)
    if (theme !== prevTheme) {
        setPrevTheme(theme)
        setResolvedTheme(resolveTheme(theme))
    }

    // Effect 1: aplicar data-theme no <html> sempre que resolvedTheme muda.
    // Convenção do design system Industry (ver frontend/src/styles/industry.css
    // e ADR-0005) — era classe .dark antes da migração.
    useEffect(() => {
        document.documentElement.dataset.theme = resolvedTheme
    }, [resolvedTheme])

    // Effect 2: persistir no storage quando theme muda.
    useEffect(() => {
        storage.set(STORAGE_KEYS.THEME, theme)
    }, [theme])

    // Effect 3: escutar mudanças do OS — somente quando estamos em 'system'.
    // Quando o user escolheu explícito ('light' ou 'dark'), ignoramos o OS.
    useEffect(() => {
        if (theme !== "system") {
            return
        }

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
        const handleChange = (event: MediaQueryListEvent) => {
            setResolvedTheme(event.matches ? "dark" : "light")
        }

        mediaQuery.addEventListener("change", handleChange)
        return () => {
            mediaQuery.removeEventListener("change", handleChange)
        }
    }, [theme])

    const setTheme = useCallback((next: Theme): void => {
        setThemeState(next)
    }, [])

    const toggleTheme = useCallback((): void => {
        // Toggle SEMPRE em escolha explícita.
        // Se está em "system", vira o oposto do que está atualmente resolvido.
        setThemeState((current) => {
            const currentResolved = current === "system" ? getSystemTheme() : current
            return currentResolved === "dark" ? "light" : "dark"
        })
    }, [])

    const value: ThemeContextValue = {
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
    }

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext)

    if (context === undefined) {
        throw new Error("useTheme deve ser usado dentro de <ThemeProvider>")
    }

    return context
}
