---
name: scaffold-projeto
description: Inicializa um projeto greenfield do zero com a fundação completa. Use SEMPRE que o usuário pedir para "iniciar o projeto", "fazer o scaffold", "criar a estrutura inicial", "montar o repositório" ou começar a base de uma aplicação nova. Cria a estrutura de monólito modular, configura ferramentas de qualidade (tsconfig strict, ESLint, Prettier, husky, dependency-cruiser), a fundação de segurança OWASP, a config segura por ambiente e o gate de CI. Não usar para features em projeto já existente (use nova-feature).
---

# Skill: Scaffold do Projeto

Estabelece a **fundação** de um projeto greenfield. Foco em estrutura, ferramentas e segurança — **não** em features de produto (isso é a skill `nova-feature`).

## Antes de começar — leia o contexto

1. `.claude/project_context/01-descricao.md`, `02-requisitos.md`, `03-arquitetura.md`, `04-tech-stack.md` — o que e como.
2. `.claude/project_context/05-security-standards.md`, `06-code-quality-standards.md`, `09-conformidade-legal.md` e `10-design-system.md` — as regras inegociáveis.
3. `.claude/project_context/07-decisoes-em-aberto.md` — **pergunte** sobre cada item antes de assumir.

## Modo de trabalho

Em **plan mode**, apresente um PLANO e aguarde aprovação. O plano deve conter:
- Bibliotecas por controle (auth, hashing, validação, headers, token storage) com justificativa de 1 linha.
- Estrutura de pastas por domínio (monólito modular).
- Proposta de schema Prisma inicial.
- Config de qualidade e segurança proposta.
- Sequência de implementação e suposições/perguntas.

## Entregáveis

- Estrutura de pastas por domínio (fronteiras isoladas).
- Schema Prisma inicial.
- Tema Tailwind/shadcn gerado **a partir dos design tokens do Claude Design** (bundle em `.claude/design/`, se já existir; senão, tema mínimo marcado `TODO(design)` — ver `10-design-system.md`).
- `tsconfig` strict, ESLint + Prettier, husky + lint-staged.
- Regras de dependency-cruiser (direção de dependência + fronteiras).
- Middlewares de segurança (authz, validação, error handler, rate limit, helmet/CORS).
- Scrubbing de PII (Sentry `beforeSend` + redaction no pino).
- Config segura por ambiente (`.env.example` documentado; sem segredos versionados).
- Gate de CI (`npm audit` + testes + dependency-cruiser + type-check + lint + format + build).
- `SECURITY.md` resumindo os controles.

## Ao concluir

Siga `.claude/project_context/08-convencoes-git.md`:
1. Acrescente uma entrada em `.claude/log/CHANGELOG.md` (tipo `scaffold`, com a branch atual).
2. Gere um **texto de commit** (Conventional Commits, ex.: `chore: scaffold inicial do projeto`) para o usuário commitar manualmente.
3. Se alguma decisão de `.claude/project_context/07-decisoes-em-aberto.md` foi tomada nesta execução: registre o **ADR** em `.claude/docs/adr/` e atualize o `07`.
4. **Fechar o ciclo com o Claude Design:** sugira ao usuário rodar `/design-sync` para exportar o design system do codebase recém-criado ao Claude Design — os próximos designs nascem usando os componentes e tokens reais (ver `10-design-system.md`).
