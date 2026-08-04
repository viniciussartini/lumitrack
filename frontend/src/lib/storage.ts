const KEYS = {
    THEME: "lumitrack:theme",
    SELECTED_PROPERTY: "lumitrack:selected-property",
} as const

type StorageKey = (typeof KEYS)[keyof typeof KEYS]

export const storage = {
    get: (key: StorageKey): string | null => {
        try {
            return localStorage.getItem(key)
        } catch {
            return null
        }
    },
    set: (key: StorageKey, value: string): void => {
        try {
            localStorage.setItem(key, value)
        } catch {
            // Safari modo privado bloqueia — falha silenciosa
        }
    },
    remove: (key: StorageKey): void => {
        try {
            localStorage.removeItem(key)
        } catch {
            // idem
        }
    },
}

export const STORAGE_KEYS = KEYS