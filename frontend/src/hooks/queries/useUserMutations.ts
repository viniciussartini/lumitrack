import { useMutation } from "@tanstack/react-query"
import { userService } from "@/services/user.service"
import type { UpdateUserInput, User } from "@/types/auth.types"

/**
 * Mutations de conta (`PUT`/`DELETE /api/users/:id`).
 *
 * Igual ao padrão de useMfaMutations.ts: o efeito colateral relevante não é
 * uma query do react-query (não há "usuário" cacheado aqui) — é o
 * `AuthContext`. Por isso não há `invalidateQueries` nem toast automático em
 * nenhuma das duas: quem chama (ProfilePage) é responsável por
 * `refreshUser()`/`logout()` e pelo próprio feedback após o sucesso.
 */

interface UpdateUserVariables {
    id: string
    input: UpdateUserInput
}

export const useUpdateUser = () =>
    useMutation<User, Error, UpdateUserVariables>({
        mutationFn: ({ id, input }) => userService.update(id, input),
    })

export const useDeleteUser = () =>
    useMutation<void, Error, string>({
        mutationFn: (id) => userService.remove(id),
    })
