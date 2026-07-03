import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { authService } from "@/services/auth.service"
import type {
    MfaDisableInput,
    MfaSetupResponse,
    MfaVerifySetupInput,
    MfaVerifySetupResponse,
} from "@/types/auth.types"

/**
 * Mutations de MFA (TOTP).
 *
 * Diferente das mutations de entidades de negócio (Property, Device etc.),
 * o efeito colateral relevante aqui não é uma query do react-query — é o
 * `user.mfaEnabled` do AuthContext. Por isso não há `invalidateQueries`
 * aqui: quem chama (SecurityPage) é responsável por chamar
 * `refreshUser()` do AuthContext após o sucesso.
 *
 * `mfaSetup` não dispara toast (apenas busca o QR code, ainda não muda
 * nada persistido). `mfaVerifySetup`/`mfaDisable` disparam, seguindo o
 * padrão do restante do app (toast de sucesso na mutation, erro decidido
 * pela página/form que consome).
 */

export const useMfaSetup = () =>
    useMutation<MfaSetupResponse, Error, void>({
        mutationFn: () => authService.mfaSetup(),
    })

export const useMfaVerifySetup = () =>
    useMutation<MfaVerifySetupResponse, Error, MfaVerifySetupInput>({
        mutationFn: (input) => authService.mfaVerifySetup(input),
        onSuccess: () => {
            toast.success("Autenticação de dois fatores ativada")
        },
    })

export const useMfaDisable = () =>
    useMutation<void, Error, MfaDisableInput>({
        mutationFn: (input) => authService.mfaDisable(input),
        onSuccess: () => {
            toast.success("Autenticação de dois fatores desativada")
        },
    })
