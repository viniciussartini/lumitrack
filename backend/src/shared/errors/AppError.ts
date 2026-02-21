// Classe base — todos os erros da aplicação herdam daqui.
export class AppError extends Error {
    public readonly statusCode: number
    public readonly isOperational: boolean

    constructor(message: string, statusCode = 500, isOperational = true) {
        super(message)
        this.statusCode = statusCode
        this.isOperational = isOperational
        Object.setPrototypeOf(this, new.target.prototype) // necessário para instanceof funcionar com herança em TS
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Recurso não encontrado") {
        super(message, 404)
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Não autorizado") {
        super(message, 401)
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Acesso negado") {
        super(message, 403)
    }
}

export class ConflictError extends AppError {
    constructor(message = "Conflito de dados") {
        super(message, 409)
    }
}

export class ValidationError extends AppError {
    constructor(message = "Dados inválidos") {
        super(message, 422)
    }
}

export class BadRequestError extends AppError {
    constructor(message = "Requisição inválida") {
        super(message, 400)
    }
}