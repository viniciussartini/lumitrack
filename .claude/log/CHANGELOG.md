# CHANGELOG — Log de Implementações

> Histórico **append-only** de tudo que foi implementado no projeto.
> Toda skill de construção/auditoria acrescenta uma entrada ao final ao concluir.
> Não reescreva entradas antigas — só adicione novas.

**Formato de cada entrada:**

```
## [YYYY-MM-DD] <tipo>: <título curto>
- **Branch:** <nome-da-branch>
- **Tipo:** scaffold | feature | fix | refactor | perf | audit-seguranca | audit-qualidade | audit-desempenho
- **O quê:** descrição em 1–2 linhas.
- **Arquivos principais:** caminhos tocados.
- **Decisões/ADRs:** referências, se houver.
- **Notas:** riscos, follow-ups, ou relatório gerado (para auditorias).
```

---

<!-- Novas entradas abaixo desta linha -->

## [2026-07-31] chore: adoção do kit `.claude/` de desenvolvimento

- **Branch:** main
- **Tipo:** chore
- **O quê:** kit de contexto + skills instalado na raiz do repositório (antes isolado em `claude-kit/`, sem efeito). `docs/` migrado para `.claude/docs/` (9 documentos, `git mv`, referências atualizadas em CI, schema Prisma, seeds e testes). `project_context/01`–`04` preenchidos a partir do código real (descrição, RF/RNF/FNC, arquitetura, stack); `07-decisoes-em-aberto.md` reduzido a 5 itens genuinamente pendentes. `dependabot.yml` da raiz mesclado com o do kit (labels + prefixo de commit), preservando os diretórios `/backend` e `/frontend`. Hooks (`block-git-commit-push.sh`, `block-env-files.sh`) marcados executáveis — guard-rails ativos a partir de agora.
- **Arquivos principais:** `CLAUDE.md`, `README-DO-KIT.md`, `.claude/**`, `.github/ISSUE_TEMPLATE/**`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/dependabot.yml`, `.gitignore`, `.github/workflows/ci.yml`, `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`, `backend/prisma/seed-demo/topology.ts`, `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/distributor/distributor.service.ts`, `frontend/tests/e2e/support/fixtures.ts`, `frontend/.env.example`.
- **Decisões/ADRs:** `adr/0002-token-storage-cookie-httponly.md`, `adr/0003-mfa-totp-opcional.md`, `adr/0004-monolito-modular-por-dominio.md` — três decisões já vigentes no código, formalizadas nesta sessão.
- **Notas:** `.claude/design/` segue vazio — nenhuma tela tem handoff bundle ainda; toda tarefa de UI cai na regra de ausência do `10-design-system.md` até `/design-sync` + primeiro handoff. Labels do GitHub (`08-convencoes-git.md`) ainda não criadas — ação externa, fora de escopo desta entrada. Referência a `docs/O-Sistema-Elétrico-Brasileiro.md` em `backend/prisma/seed.ts:35` aponta para um arquivo inexistente — não corrigida, sinalizada ao usuário.

## [2026-07-31] chore: labels do GitHub + correção da referência à wiki

- **Branch:** main
- **Tipo:** chore
- **O quê:** fecha os dois pendentes da entrada anterior. Criadas as 20 labels do bootstrap de `08-convencoes-git.md` no repositório GitHub (8 `tipo:`, 4 `prioridade:`, 4 `área:`, 3 `status:`, 1 `origem:`) via `gh label create --force`, confirmadas uma a uma com `gh label list`. Corrigida a referência quebrada em `backend/prisma/seed.ts:35` — apontava para `docs/O-Sistema-Elétrico-Brasileiro.md` (arquivo inexistente no repositório); o documento na verdade vive na wiki do GitHub (repositório separado `viniciussartini/lumitrack.wiki`), então a referência agora é a URL pública da página (`https://github.com/viniciussartini/lumitrack/wiki/O-Sistema-Elétrico-Brasileiro`).
- **Arquivos principais:** `backend/prisma/seed.ts` (comentário). Nenhum arquivo do kit alterado — a criação de labels é uma ação no GitHub, não no repositório.
- **Decisões/ADRs:** nenhuma nova.
- **Notas:** labels legadas do repositório (`bug`, `enhancement`, `Feature`, `Front-end`, etc. — defaults do GitHub e labels criadas automaticamente pelo Dependabot) foram mantidas, sem sobreposição de nome com as do kit; não foi pedida limpeza. `gh` precisou ser instalado e autenticado manualmente pelo usuário antes desta entrada (não estava disponível no ambiente do agente).
