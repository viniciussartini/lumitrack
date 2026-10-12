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

**Este é o índice canônico de ADRs.** O `03-arquitetura.md`, o `04-tech-stack.md` e o `07-decisoes-em-aberto.md` apontam para cá e não mantêm lista própria.

Decisões arquiteturais relevantes, numeradas sequencialmente a partir do template `adr/0000-template.md` (contexto → decisão → alternativas → consequências).

| ADR | Decisão | Status |
|---|---|---|
| `0001-claude-design-fonte-de-verdade-ui.md` | Claude Design como fonte de verdade de UI/UX | aceita |
| `0002-token-storage-cookie-httponly.md` | Cookie `HttpOnly` no canal WEB, Bearer no MOBILE | aceita |
| `0003-mfa-totp-opcional.md` | MFA opcional via TOTP + backup codes | aceita |
| `0004-monolito-modular-por-dominio.md` | Monólito modular por domínio, DI via `createApp(deps)` | aceita |
| `0005-industry-como-design-system.md` | Industry como design system do produto | aceita |
| `0006-migracao-incremental-por-fase.md` | Migração para o Industry incremental, por fase do roadmap | aceita |
| `0007-bandeira-tarifaria-fonte-oficial-aneel.md` | Bandeira tarifária sincronizada da fonte oficial da ANEEL | aceita |
| `0008-hospedagem-brasil-oracle-always-free.md` | Hospedagem no Brasil, máquina única, sem operador estrangeiro (Caminho B). Continuam vigentes as restrições técnicas, a condição de validade (cadastro público fechado) e os gates de go-live | parcialmente substituída pela 0010 (provedor e conclusão de conformidade) |
| `0009-observabilidade-uptime-kuma-autohospedado.md` | Uptime Kuma auto-hospedado (Caminho B) | aceita |
| `0010-demo-publica-free-tier-render-neon.md` | Demo pública em Render + Neon, escopo restrito a demonstração (Caminho A) | aceita |
| `0011-keep-alive-monitor-externo-uptimerobot.md` | Keep-alive da demo via UptimeRobot (monitor externo); o raciocínio sobre ping externo e transferência internacional segue como precedente | substituída pela 0013 |
| `0012-separacao-producao-vps-staging-render-neon.md` | Separação de ambientes — produção na VPS Hostinger (`main`), Render+Neon rebaixado a staging (`staging`) | aceita |
| `0013-fim-do-keep-alive-staging-hiberna-por-desenho.md` | Fim do keep-alive — o staging hiberna por desenho | aceita |
| `0014-ambientes-permanentemente-demonstracao.md` | Ambientes permanentemente de demonstração — nunca dado real de titular; `REGISTRATION_ENABLED` com default `false` | aceita |
| `0015-monitor-externo-producao-vps.md` | Monitor externo de disponibilidade para a produção (VPS) — `/health` exposto via Caddy | aceita |
| `0016-service-le-repository-de-outro-modulo.md` | `*.service.ts` pode importar o `*.repository.ts` de outro módulo diretamente | aceita |
| `0017-simulador-rede-propria-docker-compose.md` | Simulador com rede própria no Docker Compose — revisa a co-localização de rede da ADR-0008 | aceita |
| `0018-guarda-registro-acesso-marco-civil-nao-implementada.md` | Guarda formal de registros de acesso (Marco Civil Art. 15) não será implementada — estende a ADR-0014 | aceita |
| `0019-modelagem-tarifaria-grupo-a.md` | Modelagem tarifária do Grupo A: aditiva, sem `ConsumerClass` | aceita |
| `0020-alerta-demanda-mecanismo-proprio.md` | Alerta de ultrapassagem de demanda: mecanismo próprio, sem reaproveitar Alert/AlertEvaluator | aceita |
| `0021-bandeira-nao-incide-no-acl.md` | Bandeira tarifária não incide no Mercado Livre de Energia (ACL) | aceita |
| `0022-medidor-mede-todas-grandezas-fnc010.md` | Grandezas medidas × calculadas: datasheet do medidor-alvo (CCK 7200D) | aceita |
| `0023-relatorios-gerados-armazenados-no-postgres.md` | Relatórios gerados armazenados como bytes no PostgreSQL | aceita |
| `0024-relatorio-agendado-enviado-como-anexo.md` | Relatório agendado enviado por e-mail como anexo | aceita |
| `0025-sessoes-ativas-dispositivo-reduzido-e-ip-mascarado.md` | Sessões ativas: dispositivo reduzido e IP mascarado, ligados por `sessionId` | aceita |
| `0026-caches-em-processo-com-ttl.md` | Caches em processo com TTL de 5 min para bandeira tarifária e catálogos de tarifa (registrada depois da Fase 15) | aceita |

Um ADR nunca é apagado — se a decisão mudar, crie um novo e marque o antigo como "substituída por" (aqui e no próprio arquivo).

**Ao criar uma ADR, atualize no mesmo trabalho:** (1) uma linha nesta tabela; (2) o item correspondente do `../project_context/07-decisoes-em-aberto.md`, se a decisão o resolve (remover da lista de abertos); (3) o `../project_context/03-arquitetura.md` ou o `04-tech-stack.md`, se a decisão muda o que eles descrevem no corpo do texto.
