/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Anexado como `Authorization: Bearer` nas chamadas à API de controle do
    // simulador — precisa bater com SIMULATOR_API_TOKEN do server.
    readonly VITE_SIMULATOR_API_TOKEN?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
