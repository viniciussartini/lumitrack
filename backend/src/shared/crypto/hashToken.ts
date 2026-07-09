import { createHash } from "crypto"

// Hash determinístico (SHA-256) usado para armazenar tokens JWT/sessão no
// banco em vez do valor puro. O JWT já é uma string de alta entropia (inclui
// uma assinatura criptográfica) — o hash protege contra reuso de sessão em
// caso de vazamento do dump do banco, sem viabilizar ataque de força bruta
// sobre o espaço de entrada (que não é um segredo de baixa entropia como uma
// senha). O lookup por igualdade de hash continua O(1) via índice único.
export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex")
}
