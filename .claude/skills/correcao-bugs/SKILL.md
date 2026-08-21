---
name: correcao-bugs
description: Corrige bugs e erros no código existente — comportamento incorreto, exceções, stack traces, resultados errados. Use SEMPRE que o usuário relatar "tem um bug", "está dando erro", "não funciona", "comportamento errado", "exceção", "corrigir", "fix" ou descrever algo que deveria funcionar e não funciona. Diferente de refatoracao: aqui o objetivo é MUDAR o comportamento (de errado para certo). Reproduz, escreve teste que falha, corrige a causa-raiz e garante ausência de regressão.
model: sonnet
effort: high
---

# Skill: Correção de Bugs

Corrige comportamento **incorreto**. Distinção importante: `refatoracao` preserva comportamento; **correção de bug muda** o comportamento (de errado para certo).

## Referência
`.claude/project_context/05-security-standards.md`, `06-code-quality-standards.md` e `09-conformidade-legal.md` — a correção não pode introduzir violação.

## Procedimento (test-first)
1. **Reproduza** o bug de forma determinística; entenda a **causa-raiz** (não trate só o sintoma).
2. **Escreva um teste que falha** capturando o comportamento errado.
3. **Corrija** de forma mínima, direcionada à causa-raiz.
4. **Garanta que o teste passa** e rode a suíte inteira (sem regressão).
5. **Verifique padrões:** sem `any`, sem fronteira de módulo violada, falha fechada mantida.

## Definition of Done
- Teste de regressão cobrindo o bug, verde.
- Suíte completa, type-check, lint e dependency-cruiser passam.

## Ao concluir
Siga `.claude/project_context/08-convencoes-git.md`:
1. Acrescente entrada em `.claude/log/CHANGELOG.md` (tipo `fix`, com a branch atual).
2. Gere um **texto de commit** (`fix: ...`) para o usuário commitar manualmente.
3. Se alguma decisão de `.claude/project_context/07-decisoes-em-aberto.md` foi tomada nesta execução: registre o **ADR** em `.claude/docs/adr/` e atualize o `07`.
