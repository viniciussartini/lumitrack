// Regra local: proíbe comentário citar RF/RN/RNF/FNC seguido de número —
// identificador do 02-requisitos.md (06-code-quality-standards.md). A
// citação deve ir do requisito para o código, nunca o inverso; o
// no-warning-comments nativo do ESLint só casa substring literal, incapaz
// de expressar esse padrão sem também barrar as letras soltas em prosa
// comum — por isso uma regra própria, restrita ao padrão exato.

const REQ_REF_PATTERN = /\b(RNF|RN|RF|FNC)\d+\b/

export default {
    rules: {
        "no-comment-req-refs": {
            meta: {
                type: "problem",
                docs: {
                    description:
                        "Proíbe comentário citar RF/RN/RNF/FNC do 02-requisitos.md",
                },
                schema: [],
                messages: {
                    reqRef:
                        'Comentário cita "{{ref}}" — proibido (06-code-quality-standards.md). Explique a regra por extenso; a citação vai do 02-requisitos.md para o código, nunca o inverso.',
                },
            },
            create(context) {
                return {
                    Program() {
                        const sourceCode = context.sourceCode ?? context.getSourceCode()
                        for (const comment of sourceCode.getAllComments()) {
                            const match = REQ_REF_PATTERN.exec(comment.value)
                            if (match) {
                                context.report({
                                    loc: comment.loc,
                                    messageId: "reqRef",
                                    data: { ref: match[0] },
                                })
                            }
                        }
                    },
                }
            },
        },
    },
}
