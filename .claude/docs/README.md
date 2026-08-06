# .claude/docs/ — Documentação técnica, laudos de auditoria e ADRs

Duas categorias convivem aqui: os **documentos históricos** do LumiTrack (produzidos antes da adoção do kit, migrados de `docs/` na raiz) e os **artefatos do kit** (laudos datados, roadmap e ADRs). Ambos são versionados.

## Documentos históricos do projeto

Mantiveram os nomes originais — são citados por caminho em código, CI e entre si. A convenção de nomenclatura do kit (abaixo) vale para documentos **novos**.

| Arquivo | O que é |
|---|---|
| `AUDITORIA_SEGURANCA.md` | Auditoria OWASP Top 10:2025 + LGPD (2026-06-27, v2.0) e o registro da remediação completa. Referenciado por `.github/workflows/ci.yml`. |
| `RUNBOOK_INCIDENTES.md` | Runbook de resposta a incidentes (Art. 48 LGPD): detecção → contenção → avaliação de risco → notificação ANPD/titulares → lições aprendidas. |
| `RBAC_DESIGN.md` | Desenho de um RBAC mais extensível — **não implementado**, referência para o futuro. Citado em `backend/prisma/schema.prisma`. |
| `PLANO_REFORMULACAO_IOT.md` | Plano do rework para o modelo de medidores IoT. |
| `PLANO_SIMULADOR_IOT_E_SEED_DEMO.md` | Plano do simulador de dispositivos e do seed de demonstração. |
| `PLANO_E2E_POS_REFORMULACAO_IOT.md` | Plano de reformulação da suíte Playwright pós-rework. |
| `LOG_IMPLEMENTACAO_IOT.md` · `LOG_SIMULADOR_IOT.md` · `LOG_E2E_POS_REFORMULACAO_IOT.md` | Logs de execução dos planos acima. |

## Laudos de auditoria (kit)

Produzidos pelos subagents em `.claude/agents/` (somente-leitura) e salvos aqui pela conversa principal. Convenção: `YYYY-MM-DD-<tipo>-audit.md`, com `<tipo>` em `seguranca` · `conformidade` · `qualidade` · `desempenho`.

Exemplo: `2026-08-15-seguranca-audit.md`.

Um laudo é um **plano de avaliação** (achados + recomendações), não uma correção. A correção de cada achado é executada à parte pelas skills `refatoracao`, `correcao-bugs` ou `nova-feature`.

## Documentos de conformidade (kit)

Artefatos de governança LGPD produzidos pela remediação da Fase 11
(`roadmap.md`, épico #154) — versionados como os demais documentos do kit.

| Arquivo | O que é |
|---|---|
| `PROCEDIMENTO_DIREITOS_TITULAR.md` | Procedimento de atendimento aos direitos do titular (LGPD Art. 18): canal, prazo (30 dias — regime de pequeno porte), passo a passo e o que um fork comercial precisa sanar antes de operar com titulares reais. Issue #155. |

## Roadmap

`roadmap.md` — documento vivo mantido pela skill `planejar-roadmap` (fases em fatias verticais, P0/P1/P2, XS–XL). Ainda não criado.

## ADRs (`adr/`)

Decisões arquiteturais relevantes, numeradas sequencialmente a partir do template `adr/0000-template.md` (contexto → decisão → alternativas → consequências).

| ADR | Decisão |
|---|---|
| `0001-claude-design-fonte-de-verdade-ui.md` | Claude Design como fonte de verdade de UI/UX |
| `0002-token-storage-cookie-httponly.md` | Cookie `HttpOnly` no canal WEB, Bearer no MOBILE |
| `0003-mfa-totp-opcional.md` | MFA opcional via TOTP + backup codes |
| `0004-monolito-modular-por-dominio.md` | Monólito modular por domínio, DI via `createApp(deps)` |
| `0005-industry-como-design-system.md` | Industry como design system (migração do frontend pendente) |

Um ADR nunca é apagado — se a decisão mudar, crie um novo e marque o antigo como "substituída por". Se a decisão resolve um item de `../project_context/07-decisoes-em-aberto.md`, atualize aquele arquivo.
