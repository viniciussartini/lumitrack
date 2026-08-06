/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Ver `src/config/privacy.ts` — canal de comunicação com o titular (LGPD Art. 18). */
    readonly VITE_PRIVACY_CONTACT_EMAIL?: string
}
