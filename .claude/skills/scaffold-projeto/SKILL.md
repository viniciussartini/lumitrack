---
name: scaffold-projeto
description: Inicializa um projeto greenfield do zero com a fundação completa. Começa por uma ENTREVISTA de arquitetura e tech stack (com opções, recomendações e trade-offs) quando 03-arquitetura.md ou 04-tech-stack.md estiverem [PREENCHER], registrando as decisões como ADRs. Use SEMPRE que o usuário pedir para "iniciar o projeto", "fazer o scaffold", "criar a estrutura inicial", "montar o repositório", "definir a stack", "definir a arquitetura" ou começar a base de uma aplicação nova. Cria a estrutura de monólito modular, configura ferramentas de qualidade (tsconfig strict, ESLint, Prettier, husky, dependency-cruiser), a fundação de segurança OWASP, a config segura por ambiente e o gate de CI. Não usar para features em projeto já existente (use nova-feature).
model: opus
effort: max
---

# Skill: Scaffold do Projeto

Estabelece a **fundação** de um projeto greenfield. Foco em estrutura, ferramentas e segurança — **não** em features de produto (isso é a skill `nova-feature`).

## Antes de começar — leia o contexto

1. `.claude/project_context/01-descricao.md`, `02-requisitos.md`, `03-arquitetura.md`, `04-tech-stack.md` — o que e como.
2. `.claude/project_context/05-security-standards.md`, `06-code-quality-standards.md`, `09-conformidade-legal.md`, `10-design-system.md` e `11-seguranca-infraestrutura.md` — as regras inegociáveis. Após definir a stack (Bloco B), leia as seções correspondentes de `12-seguranca-por-tecnologia.md`.
3. `.claude/project_context/07-decisoes-em-aberto.md` — **pergunte** sobre cada item antes de assumir.

## Fase 0 — Entrevista de fundação (arquitetura → stack)

Se `03-arquitetura.md` (seção "Específico do projeto") ou `04-tech-stack.md` contiverem `[PREENCHER]`, **conduza a entrevista antes de qualquer código**. Ordem obrigatória: **arquitetura primeiro, stack depois** — a stack materializa a arquitetura, nunca o contrário.

**Como conduzir:** uma pergunta (ou bloco curto) por vez, com **opções e uma recomendação justificada** — não um questionário despejado de uma vez. Para cada resposta, explique a consequência prática ("isso significa que…"). Se o usuário não souber, proponha o default do kit e siga; decisão não tomada vai para `07-decisoes-em-aberto.md`, não trava a entrevista.

### Bloco A — Arquitetura

0. **Modo de trabalho (pergunte primeiro):** solo ou equipe? Se equipe, quantas pessoas e quem revisa o quê. Registre em `01-descricao.md` — o modo ativa as regras `[EQUIPE]` (revisão obrigatória, CODEOWNERS, offboarding) em todo o kit.
1. **Domínios do negócio:** quais são os módulos (linguagem ubíqua do `01`/`02`)? Fronteiras e o que cada um possui.
2. **Forma da aplicação:** só API? SPA + API? SSR? App mobile? *(Default do kit: monólito modular; SPA + API separada.)*
3. **Integrações externas:** pagamentos, e-mail, storage, terceiros — quais são obrigatórias no MVP?
4. **Requisitos que forçam infraestrutura:** rode as perguntas de System Design já no `03` (escala real, perfil de carga, latência, tolerância a falha, trabalho assíncrono, fonte da verdade). *Sem requisito real e medido, nada de cache/fila/réplica — a trava do `03` vale aqui.*
5. **Autenticação e autorização:** quem são os atores? Papéis? Multi-tenant? Aprofunde — estes itens condicionam o front e o backend inteiros e, se não decididos, vão para o `07`:
   - **Estratégia de credencial:** sessão server-side vs. token (e, se token, onde é armazenado — cookie `HttpOnly` vs. memória). Ver `05` e `12`.
   - **Provedores externos:** login social/OIDC? Quais? Ou apenas credencial própria?
   - **MFA:** exigido? Método (TOTP, e-mail, SMS) e em quais ações.
   - **Recuperação de acesso:** fluxo e canal.
6. **Dados sensíveis (cruze com `09`):** o sistema trata dado pessoal/sensível? Isso muda modelagem, retenção e logs.
7. **Estilo arquitetural:** monólito simples · monólito modular · módulos deployáveis · microserviços · serverless. *Default recomendado: monólito modular* — apresente como proposta com trade-offs (tamanho e experiência da equipe, escala real, necessidade de deploy independente, custo operacional), **não como decisão pronta**. Exige ADR.
8. **Comunicação entre módulos, cross-cutting e fronteira transacional** (ver `03`): síncrona por interface, eventos ou ambos; onde moram auth/erro/log/config/flags; o que precisa ser atômico.
9. **Fonte de design (`10`):** qual ferramenta define a UI (Claude Design, Figma, Penpot, code-first)? Onde ficam as entregas e como os tokens chegam ao tema. Exige ADR.

### Bloco B — Stack

Só depois do Bloco A aprovado. Para cada camada, apresente **a recomendação do kit + 1–2 alternativas + o critério de escolha**, e pergunte se há restrição (experiência do time, custo, hospedagem exigida, integração legada):

- Linguagem/runtime · Framework de API · ORM/acesso a dados · Banco · Frontend (framework, roteamento, estado/dados, UI) · Validação · Auth · Testes · Observabilidade · Hospedagem/CI.

**Referência de partida** (stack default recomendada pelo kit — proponha, não imponha; valide contra o tamanho da equipe e a criticidade do sistema):
> React + TypeScript + Vite · Tailwind + shadcn/ui · TanStack Query + Zustand · React Router · React Hook Form + Zod · Node.js + Express + TypeScript · Prisma · PostgreSQL · JWT + refresh tokens · Vitest + Playwright · Sentry + pino · Vercel/Railway/Neon + GitHub Actions.

**Critérios de decisão a explicitar em cada escolha:** maturidade e comunidade, curva de aprendizado real do usuário, custo (inclui free tier), aderência aos padrões do kit (`05`, `06`, `09`), e — o mais esquecido — **custo de saída** se a escolha se provar errada.

### Saída da entrevista

1. Preencha `03-arquitetura.md` (seção "Específico do projeto"), `04-tech-stack.md` e a seção "Fonte de design do projeto" do `10-design-system.md` com as decisões.
2. Registre **um ADR por decisão estruturante** (estilo arquitetural, forma da aplicação, banco, estratégia de credencial, ferramenta de design, qualquer componente de infra além do default) em `.claude/docs/adr/`, com alternativas consideradas.
3. Jogue o que ficou indefinido em `07-decisoes-em-aberto.md`, no formato declarado lá (opções · impacto · o que falta para decidir).
4. **Só então** siga para o plano de scaffold.

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
- Tema do frontend gerado **a partir dos design tokens da fonte de design declarada** (`10-design-system.md`); sem entrega de design ainda, tema mínimo marcado `TODO(design)`.
- `tsconfig` strict, ESLint + Prettier + `eslint-plugin-jsdoc`, husky + lint-staged.
- **Fundação de infraestrutura conforme o `11` (itens `[P0]`):** usuário de banco sem DDL + usuário de migração separado, `sslmode=require`, seed sintético, workflows com `permissions:` mínimo e actions pinadas por SHA, secret scanning/push protection, `.env.example` sem valores reais, ambientes isolados.
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
4. **Onboarding:** sugira rodar a skill `onboarding` para gerar `.claude/docs/onboarding.md` — útil em equipe e também em solo (retomada futura do projeto).
5. **Fechar o ciclo com a ferramenta de design:** sugira sincronizar o design system do codebase recém-criado com a ferramenta declarada (no Claude Design, `/design-sync`) — os próximos designs nascem usando os componentes e tokens reais (ver `10-design-system.md`).
