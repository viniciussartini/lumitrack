import bcrypt from "bcryptjs"
import { z } from "zod"
import { createUserSchema, updateUserSchema } from "@/modules/user/user.schema.js"
import type { UserRepository } from "@/modules/user/user.repository.js"
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// Custo do bcrypt: quanto maior, mais lento o hash (e mais seguro).
// 12 é um bom equilíbrio entre segurança e performance.
const BCRYPT_ROUNDS = 12

export class UserService {
    constructor(private readonly userRepository: UserRepository) {}

    async createUser(input: unknown) {
        const parsed = createUserSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        const existingEmail = await this.userRepository.findByEmail(data.email)

        if (existingEmail) {
            throw new ConflictError("E-mail já cadastrado")
        }

        if (data.userType === "INDIVIDUAL" && data.cpf) {
            const existingCpf = await this.userRepository.findByCpf(data.cpf)

                if (existingCpf) {
                    throw new ConflictError("CPF já cadastrado")
                }
        }

        if (data.userType === "COMPANY" && data.cnpj) {
            const existingCnpj = await this.userRepository.findByCnpj(data.cnpj)

                if (existingCnpj) {
                    throw new ConflictError("CNPJ já cadastrado")
                }
        }

        const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS)

        return this.userRepository.create({
            ...data,
            password: hashedPassword,
        })
    }

    async findById(id: string) {
        const user = await this.userRepository.findById(id)

        if (!user) {
            throw new NotFoundError("Usuário não encontrado")
        }

        return user
    }

    async updateUser(id: string, input: unknown) {
        const existing = await this.userRepository.findById(id)

        if (!existing) {
            throw new NotFoundError("Usuário não encontrado")
        }

        const parsed = updateUserSchema.safeParse(input)

        if (!parsed.success) {
            const firstError = Object.values(
                z.flattenError(parsed.error).fieldErrors,
            ).flat()[0]
            throw new ValidationError(firstError ?? "Dados inválidos")
        }

        const data = parsed.data

        if (data.email && data.email !== existing.email) {
            const emailConflict = await this.userRepository.findByEmail(data.email)

            if (emailConflict) {
                throw new ConflictError("E-mail já cadastrado")
            }
        }

        return this.userRepository.update(id, data)
    }

    async deleteUser(id: string): Promise<void> {
        const existing = await this.userRepository.findById(id)

        if (!existing) {
            throw new NotFoundError("Usuário não encontrado")
        }

        await this.userRepository.delete(id)
    }
}