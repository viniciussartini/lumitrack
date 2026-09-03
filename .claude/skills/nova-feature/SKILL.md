---
name: nova-feature
description: Constrói uma feature ou módulo novo na aplicação garantindo que ele siga os mesmos paradigmas do projeto. Use SEMPRE que o usuário pedir para "criar uma feature", "implementar um módulo", "adicionar funcionalidade", "construir o endpoint/tela de X" num projeto já existente. Garante monólito modular, controles OWASP, SOLID/clean code, validação Zod na borda, testes na pirâmide e registro no changelog. Não usar para o setup inicial (use scaffold-projeto) nem para mexer só em código já existente sem nova funcionalidade (use refatoracao).
model: sonnet
effort: high
---

# Skill: Construir Nova Feature

Implementa uma feature nova **com os mesmos padrões** do resto do projeto — não improvisar.

## Antes de começar — leia o contexto

1. `.claude/project_context/03-arquitetura.md` — em qual módulo a feature entra; respeitar fronteiras.
2. `.claude/project_context/05-security-standards.md`, `06-code-quality-standards.md` e `09-conformidade-legal.md` — controles obrigatórios. **Se a feature tocar migração, pipeline, ambiente ou segredo:** também `11-seguranca-infraestrutura.md`. **Consulte `12-seguranca-por-tecnologia.md`** nas seções do stack envolvido na feature.
3. `.claude/project_context/02-requisitos.md` — o RF/FNC que esta feature atende.
4. **Se a feature tem UI:** `.claude/project_context/10-design-system.md` (fonte de design declarada + regras) e a entrega de design da tela no diretório versionado.

## Modo de trabalho

Para features que cruzam módulos ou tocam auth/dados sensíveis, use **plan mode** e aguarde aprovação. Para features pequenas e isoladas, um plano curto inline basta — mas explicite as suposições.

## Checklist de implementação

- **Estrutura:** código no módulo de domínio correto; sem importar infra no domínio (DIP).
- **Design (se há UI):** localizar a entrega de design vigente e implementar **a partir da spec** (componentes, hierarquia, tokens) — sem improvisar layout. Entrega ausente ou em conflito com padrões do kit → seguir as regras de ausência/divergência do `10-design-system.md` (perguntar, não assumir). Componente reutilizável novo → lembrar o usuário de sincronizar de volta com a ferramenta de design.
- **Validação:** schema Zod na borda (reaproveitar schema compartilhado FE/BE quando aplicável).
- **Acesso (A01):** authz server-side + checagem de ownership.
- **Injection (A05):** queries via Prisma parametrizadas.
- **Erros (A10):** falhar fechado; mensagem genérica ao usuário.
- **PII (A09 + LGPD):** nada sensível em log; minimização.
- **Qualidade:** TS strict, sem `any`; funções pequenas; nomes reveladores.
- **Comentários:** funcionais — Javadoc/JSDoc em classes, funções públicas e lógica não óbvia, explicando o **porquê**. **Nunca** referencie issue, PR, auditoria, achado, data ou autor no comentário (`06`): rastreabilidade vive no git, nos ADRs e nas issues, e o lint (`no-warning-comments`) barra.
- **Testes (test-first no domínio):** comece pelos testes da regra de negócio, derivados dos **critérios de aceite** da issue (ATDD-lite); integração do contrato; E2E só se for fluxo crítico. UI/cola podem ser teste-depois.

## Definition of Done

- type-check (zero `any`), lint, format, testes e dependency-cruiser passam.
- Controles de segurança aplicáveis cobertos por teste.

## Ao concluir

Siga `.claude/project_context/08-convencoes-git.md`:
1. Acrescente uma entrada em `.claude/log/CHANGELOG.md` (tipo `feature`, com a branch atual).
2. Gere um **texto de commit** (`feat: ...`) para o usuário commitar manualmente.
3. Se alguma decisão de `.claude/project_context/07-decisoes-em-aberto.md` foi tomada nesta execução: registre o **ADR** em `.claude/docs/adr/` e atualize o `07`.
