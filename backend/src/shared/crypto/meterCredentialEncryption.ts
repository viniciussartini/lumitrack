import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import { env } from "@/config/env.js"

// Mesmo algoritmo de shared/crypto/encryption.ts (AES-256-GCM), mas com
// chave própria (METER_CREDENTIAL_ENCRYPTION_KEY) — compartimentaliza o
// risco: a credencial de protocolo do medidor (ex.: senha MQTT em
// Meter.extra.password) é tão sensível quanto uma senha de usuário, então
// não compartilha chave com CPF/CNPJ, endereço ou segredo MFA.
// Módulo separado (não parametrizado por chave) seguindo o mesmo padrão já
// usado no projeto para addressEncryption.ts/mfaEncryption.ts vs. encryption.ts.

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
    return Buffer.from(env.METER_CREDENTIAL_ENCRYPTION_KEY, "hex")
}

export function encryptMeterCredential(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, getKey(), iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, ciphertext]).toString("base64")
}

export function decryptMeterCredential(encoded: string): string {
    const buffer = Buffer.from(encoded, "base64")
    const iv = buffer.subarray(0, IV_LENGTH)
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
