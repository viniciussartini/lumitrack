import { generateSecret, generateURI, verify } from "otplib"

// Wrapper fino sobre otplib — TOTP (RFC 6238) tem janelas de tempo e
// detalhes de HMAC sutis o suficiente para que reimplementar à mão seja
// um risco real de segurança (decisão registrada com o usuário: usar uma
// lib madura/testada em vez de código novo de criptografia).
//
// otplib v13 reescreveu a API antiga baseada em `authenticator` (v12) para
// um conjunto de funções — generate/verify são assíncronas (compatíveis
// com qualquer crypto plugin, incluindo o default baseado em WebCrypto).

const ISSUER = "LumiTrack"

export function generateTotpSecret(): string {
    return generateSecret()
}

// otpauth://totp/LumiTrack:user@example.com?secret=...&issuer=LumiTrack
// — formato padrão que qualquer app autenticador (Google Authenticator,
// Authy, etc.) reconhece ao escanear o QR code.
export function generateTotpUri(email: string, secret: string): string {
    return generateURI({ issuer: ISSUER, label: email, secret })
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
    try {
        // epochTolerance por padrão é 0 no otplib v13 — exigiria que o
        // código fosse validado dentro do mesmíssimo passo de 30s em que
        // foi gerado, sem margem para o tempo de round-trip (rede + hash de
        // senha + escrita no banco). Tolerância de 1 passo (±30s) é a
        // prática padrão de TOTP (RFC 6238) para absorver latência normal e
        // pequeno desvio de relógio do autenticador do usuário.
        const result = await verify({ secret, token: code, epochTolerance: 1 })
        return result.valid
    } catch {
        // otplib lança se o código não tiver o formato esperado (ex.: não
        // numérico) — trata como inválido em vez de propagar a exceção.
        return false
    }
}
