---
name: refatoracao
description: Refatora código existente preservando o comportamento, aplicando SOLID e clean code. Use SEMPRE que o usuário pedir para "refatorar", "limpar", "melhorar a estrutura", "reduzir complexidade", "extrair", "renomear" ou eliminar code smell em código que já existe, sem mudar o que ele faz. Caracteriza com testes antes, aplica os padrões e verifica que fronteiras de módulo e comportamento foram preservados. Não usar para adicionar funcionalidade nova (use nova-feature).
model: sonnet
effort: high
---

# Skill: Refatoração de Código

Melhora a estrutura **sem alterar o comportamento observável**.

## Antes de começar — leia o contexto

1. `.claude/project_context/06-code-quality-standards.md` — alvo da refatoração (SOLID, clean code, direção de dependência).
2. `.claude/project_context/03-arquitetura.md` — fronteiras de módulo que não podem ser violadas.

## Procedimento (rede de segurança primeiro)

1. **Caracterize:** garanta que há testes cobrindo o comportamento atual. Se não houver, escreva testes de caracterização **antes** de tocar no código.
2. **Identifique o smell:** o que e por quê (função grande, dependência invertida errada, duplicação real, nome ruim).
3. **Refatore em passos pequenos**, rodando os testes a cada passo.
4. **Aplique YAGNI/KISS:** simplificar, não adicionar camadas especulativas.

## Verificação obrigatória

- Testes continuam verdes (comportamento preservado).
- type-check, lint, format passam.
- **dependency-cruiser** continua verde (nenhuma fronteira nova violada).
- **Comentários:** funcionais — Javadoc/JSDoc em classes, funções públicas e lógica não óbvia, explicando o **porquê**. **Nunca** referencie issue, PR, auditoria, achado, data ou autor no comentário (`06`): rastreabilidade vive no git, nos ADRs e nas issues, e o lint (`no-warning-comments`) barra. Refatoração é o momento clássico de escrever "movido conforme achado X" — não escreva.

## Ao concluir

Siga `.claude/project_context/08-convencoes-git.md`:
1. Acrescente uma entrada em `.claude/log/CHANGELOG.md` (tipo `refactor`, com a branch atual).
2. Gere um **texto de commit** (`refactor: ...`) para o usuário commitar manualmente.
3. Se alguma decisão de `.claude/project_context/07-decisoes-em-aberto.md` foi tomada nesta execução: registre o **ADR** em `.claude/docs/adr/` e atualize o `07`.
