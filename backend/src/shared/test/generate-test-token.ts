import jwt from "jsonwebtoken"
import "dotenv/config"

// Gera um token JWT válido para uso nos testes de integração HTTP.

interface TestTokenPayload {
    id: string
    email: string
    userType: string
}

export function generateTestToken(payload: TestTokenPayload): string {
    const secret = process.env["JWT_SECRET"]

    if (!secret) {
        throw new Error("JWT_SECRET não está definida no .env")
    }

    // Geramos com expiração curta — o suficiente para o teste rodar.
    // Usamos a mesma chave secreta do ambiente para que o middleware
    // de autenticação real aceite o token sem modificações.
    return jwt.sign(payload, secret, { expiresIn: "1h" })
}