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
| `O-Sistema-Eletrico-Brasileiro.md` | Referência do sistema elétrico brasileiro (tarifação, grupos, bandeiras) para a expansão de domínio das Fases 19–22. **Fonte de verdade** — existe também na wiki do projeto (repositório git separado), sincronizada manualmente; ao alterar um, alterar o outro no mesmo trabalho (ver `CLAUDE.md`). |

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
| `ROPA.md` | Registro das operações de tratamento (LGPD Art. 37): uma linha por operação identificável no schema (finalidade, dados, base legal, retenção, operadores, transferência internacional, segurança) + tabela de operadores (Art. 39). Issue #156 — mantido pela skill `nova-feature` a cada operação nova. |
| `RIPD.md` | Relatório de impacto da medição contínua (LGPD Art. 38): necessidade/proporcionalidade da granularidade por minuto, riscos aos titulares, salvaguardas verificadas e riscos residuais com plano de tratamento. Issue #157 — reavaliar a cada mudança material do modelo de dados avaliado. |

## Roadmap e onboarding

- `roadmap.md` — documento vivo mantido pela skill `planejar-roadmap`: fases em fatias verticais, P0/P1/P2, XS–XL, agrupadas em **entregas (milestones)**.
- `onboarding.md` — guia de entrada no projeto, gerado pela skill `onboarding` (setup verificado, ordem de leitura do contexto, mapa dos módulos, armadilhas e primeira tarefa). **Ainda não gerado.**
- `DEPLOY.md` — procedimento de go-live: os dois caminhos de deploy (Render+Neon e self-hosted/VPS), checklist de `.env` de produção e restauração de backup testada. Produzido pela Fase 13.5 do roadmap; referenciado por `04-tech-stack.md`, `render.yaml`, `Dockerfile` e pela ADR-0011.
- `SEGURANCA-VPS.md` — companheiro do `DEPLOY.md` para a **máquina** em vez da aplicação: endurecimento de SSH, firewall, separação de privilégio, atualizações, backup cifrado e TLS, cada configuração explicada para quem nunca administrou servidor. Inclui o bloco de comandos de **auditoria periódica**, as decisões deliberadamente não adotadas (com o porquê) e a varredura de dados sensíveis num repositório público. Produzido na Fase 13.7.

## ADRs (`adr/`)

Decisões arquiteturais relevantes, numeradas sequencialmente a partir do template `adr/0000-template.md` (contexto → decisão → alternativas → consequências).

| ADR | Decisão |
|---|---|
| `0001-claude-design-fonte-de-verdade-ui.md` | Claude Design como fonte de verdade de UI/UX |
| `0002-token-storage-cookie-httponly.md` | Cookie `HttpOnly` no canal WEB, Bearer no MOBILE |
| `0003-mfa-totp-opcional.md` | MFA opcional via TOTP + backup codes |
| `0004-monolito-modular-por-dominio.md` | Monólito modular por domínio, DI via `createApp(deps)` |
| `0005-industry-como-design-system.md` | Industry como design system do produto |
| `0006-migracao-incremental-por-fase.md` | Migração para o Industry incremental, por fase do roadmap |
| `0007-bandeira-tarifaria-fonte-oficial-aneel.md` | Bandeira tarifária sincronizada da fonte oficial da ANEEL |
| `0008-hospedagem-brasil-oracle-always-free.md` | Hospedagem no Brasil, máquina única, sem operador estrangeiro (Caminho B) |
| `0009-observabilidade-uptime-kuma-autohospedado.md` | Uptime Kuma auto-hospedado (Caminho B) |
| `0010-demo-publica-free-tier-render-neon.md` | Demo pública em Render + Neon, escopo restrito a demonstração (Caminho A) |
| `0011-keep-alive-monitor-externo-uptimerobot.md` | Keep-alive da demo via UptimeRobot (monitor externo) |
| `0012-separacao-producao-vps-staging-render-neon.md` | Separação de ambientes — produção na VPS Hostinger (`main`), Render+Neon rebaixado a staging (`staging`) |

Um ADR nunca é apagado — se a decisão mudar, crie um novo e marque o antigo como "substituída por". Se a decisão resolve um item de `../project_context/07-decisoes-em-aberto.md`, atualize aquele arquivo.
