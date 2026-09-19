import { useId, type ReactNode } from "react"
import { ChevronDown, ChevronRight, Pencil, Trash2, type LucideIcon } from "lucide-react"

interface TreeRowProps {
    /** 0 propriedade, 1 área, 2 dispositivo — define recuo e tipografia. */
    level: 0 | 1 | 2
    icon: LucideIcon
    name: string
    /** Texto secundário à direita do nome (contagens, potência). */
    meta?: string
    /** Nome do tipo do item, usado nos rótulos dos botões (ex.: "área"). */
    noun: string
    /** Só as linhas com filhos são expansíveis; passe junto com `isOpen`. */
    onToggle?: () => void
    isOpen?: boolean
    onEdit: () => void
    onDelete: () => void
    /** Linhas filhas, mostradas quando `isOpen`. */
    children?: ReactNode
}

interface RowActionsProps {
    noun: string
    name: string
    onEdit: () => void
    onDelete: () => void
}

const RowActions = ({ noun, name, onEdit, onDelete }: RowActionsProps) => (
    <>
        <button
            type="button"
            className="lt-iconbtn lt-iconbtn-sm"
            aria-label={`Editar ${noun} ${name}`}
            onClick={onEdit}
        >
            <Pencil className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button
            type="button"
            className="lt-iconbtn lt-iconbtn-sm"
            aria-label={`Excluir ${noun} ${name}`}
            onClick={onDelete}
        >
            <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
        </button>
    </>
)

/**
 * Linha da árvore de cadastro: alvo de expandir/recolher (quando há filhos),
 * nome, meta e os botões de editar e excluir. O conteúdo recolhido sai do
 * foco (`inert`) e da leitura (`aria-hidden`), mas continua no DOM para a
 * transição de altura.
 */
export const TreeRow = ({
    level,
    icon: Icon,
    name,
    meta,
    noun,
    onToggle,
    isOpen = false,
    onEdit,
    onDelete,
    children,
}: TreeRowProps) => {
    const childrenId = useId()
    const Chevron = isOpen ? ChevronDown : ChevronRight

    const content = (
        <>
            <span className="text-muted flex w-4 shrink-0" aria-hidden="true">
                {onToggle && <Chevron className="h-4 w-4" strokeWidth={1.6} />}
            </span>
            <Icon
                className="text-accent h-15px w-15px shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
            />
            <span className="min-w-0 flex-1">{name}</span>
            {meta && <span className="lt-cadtree-meta">{meta}</span>}
        </>
    )

    return (
        <>
            <div className="lt-cadtree-row" data-level={level}>
                {onToggle ? (
                    <button
                        type="button"
                        className="lt-cadtree-main"
                        aria-expanded={isOpen}
                        aria-controls={childrenId}
                        onClick={onToggle}
                    >
                        {content}
                    </button>
                ) : (
                    <div className="lt-cadtree-main">{content}</div>
                )}
                <RowActions noun={noun} name={name} onEdit={onEdit} onDelete={onDelete} />
            </div>
            {onToggle && (
                <div
                    id={childrenId}
                    className="lt-collapse"
                    data-open={isOpen}
                    inert={!isOpen}
                    aria-hidden={!isOpen}
                >
                    <div>{children}</div>
                </div>
            )}
        </>
    )
}
