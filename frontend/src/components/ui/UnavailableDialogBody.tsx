import { Button } from "@/components/ui/Button"

interface UnavailableDialogBodyProps {
    /** Por que não há onde criar o item. */
    message: string
    onClose: () => void
}

/**
 * Corpo de um modal de criação sem opção de pai (nenhuma propriedade, nenhuma
 * área): a explicação no lugar do formulário, com um botão para fechar.
 */
export const UnavailableDialogBody = ({ message, onClose }: UnavailableDialogBodyProps) => (
    <div className="flex flex-col gap-6">
        <p className="text-muted m-0 text-sm">{message}</p>
        <div className="border-divider flex justify-end border-t pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
                Fechar
            </Button>
        </div>
    </div>
)
