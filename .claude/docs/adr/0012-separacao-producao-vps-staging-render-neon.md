# ADR-0012 — Separação de ambientes: VPS Hostinger (produção) + Render/Neon (staging)

- **Data:** 2026-08-22
- **Status:** aceita
- **Branch/Issue relacionada:** Fase 13.7 do roadmap (a criar via `criar-issues`)
- **Relação com outras ADRs:** **retoma a conclusão de conformidade da ADR-0008** para o ambiente de produção — região São Paulo confirmada, sem operador estrangeiro. **Redefine o escopo da ADR-0010**, que continua vigente: Render+Neon deixa de ser "a" produção e passa a ser o ambiente de staging/integração, mantendo a mesma exposição residual já registrada lá (transferência internacional de registros de acesso de visitante). **A ADR-0014 (2026-08-23) declara essa separação permanente** — não é mais "produção pode um dia abrir cadastro real", é "não vai abrir".

## Contexto

A ADR-0010 já previa este momento: *"se o projeto passar a operar com usuários reais, a hospedagem migra para infraestrutura brasileira antes disso... o caminho já está implementado e versionado neste repositório — `docker-compose.yml`, `deploy/Caddyfile`, `deploy/provision-vm.sh`, os scripts de backup... foi exatamente para isso que ele foi preservado"* (Caminho B do `DEPLOY.md`).

O autor contratou uma VPS paga (Hostinger, plano KVM 4 — tipicamente 4 vCPU / 16 GB RAM / 200 GB NVMe, confirmar specs exatas no hPanel — Ubuntu 24.04 LTS, datacenter São Paulo) e decidiu executar essa migração agora, com um objetivo adicional que a ADR-0010 não previa: **separar formalmente produção de um ambiente de testes/integração**, em vez de ter uma única branch (`main`) fazendo as duas funções.

## Decisão

**Dois ambientes com papéis distintos, cada um servido por uma branch de longa duração:**

| | Branch | Infraestrutura | Papel |
|---|---|---|---|
| **Produção** | `main` | VPS Hostinger, São Paulo (Caminho B do `DEPLOY.md`) | Ambiente estável, testado e consolidado — o que fica acessível ao público como "o produto". |
| **Staging** | `staging` (nova) | Render + Neon (Caminho A, inalterado) | Recebe o merge de toda branch de implementação para validação online antes da promoção. Continua público — é também onde a demo de portfólio permanece enquanto a VPS estabiliza. |

**Fluxo:** `feat/fix/epic/{N}-...` → PR → `staging` → validado online → PR → `main`.

Isso muda a convenção de `08-convencoes-git.md` ("Base: sempre `main`") para "Base: `staging`, salvo o PR de promoção `staging`→`main`" — atualizado no mesmo commit desta ADR.

### Por que a VPS retoma a conclusão da ADR-0008, e o Render não

A condição que a ADR-0008 exigia era **região Brasil + always-on + sem operador estrangeiro**. A VPS Hostinger em São Paulo satisfaz as três: Postgres roda na própria máquina (nenhum banco gerenciado de terceiro), backend/frontend/simulador na própria máquina, e o provedor de infraestrutura (Hostinger) é o único agente externo — mesma natureza que a Oracle Cloud já era na ADR-0008 original, só que paga em vez de free tier.

O Render+Neon continua nos EUA. A exposição residual documentada na ADR-0010 (IP e registro de acesso de visitante, sem SCC) **não desaparece** com esta ADR — ela persiste enquanto o staging for público, e é exatamente por isso que a Fase 13.6 do roadmap (correções críticas de conformidade nesse ambiente) continua necessária mesmo depois desta decisão.

### Postura assumida para a VPS (a confirmar na execução da Fase 13.7)

A VPS herda, por ora, a **mesma postura de hoje**: cadastro público fechado (`REGISTRATION_ENABLED=false`), apenas contas de demonstração sintéticas. Não é uma decisão de abrir cadastro real — é continuidade do que já vale para o Render. Abrir cadastro real é uma decisão futura, distinta, que reabriria a análise de conformidade (mesma ressalva que a ADR-0008 já registrava).

## Alternativas consideradas

- **Manter uma única branch `main` fazendo produção e teste** — descartada pelo próprio autor: sem um ambiente de validação online antes do merge final, bugs que só aparecem em produção real (como os quatro corrigidos após a Fase 13.5) só seriam descobertos depois de já estarem no ar para o público de produção.
- **Migrar tudo para a VPS e desligar o Render** — descartada: perderia o ambiente de staging, e o Render já está pago (gratuito) e funcional — reaproveitá-lo como staging tem custo zero adicional.
- **VPS como staging e Render como produção (inverso)** — descartada: contradiz o objetivo do autor (produção sob controle próprio, na infraestrutura paga e íntegra) e desperdiçaria a capacidade da VPS num papel que precisa de menos garantias.

## Consequências

**Positivas**

- Produção volta a ter a postura de conformidade mais simples (sem operador estrangeiro), agora sobre infraestrutura paga e com capacidade real (16 GB RAM contra o 1 OCPU/6GB compartilhado que a Oracle Always Free nunca chegou a entregar de forma confiável).
- Fluxo de validação online antes de produção — reduz a chance de repetir a classe de bug que só apareceu em uso real pós-13.5 (SSE cross-origin, `IOT_ALLOWED_HOSTS` IPv6, credencial de medidor apagada em update, devices nunca ligados no boot).
- O Caminho B do `DEPLOY.md`, preservado desde a ADR-0008 sem nunca ter sido executado de verdade, finalmente é validado em produção real.

**Negativas e custos aceitos**

- **Dois ambientes a manter em vez de um** — dobra a superfície de configuração de `.env`, segredos e monitoramento. Mitigado por reaproveitar os mesmos artefatos (`docker-compose.yml`, scripts) nos dois, com valores diferentes.
- **Custo recorrente da VPS** — sai do regime "zero custo" que orientou as decisões de hospedagem anteriores (ADR-0008, ADR-0010). Decisão do autor, fora do escopo desta ADR questionar.
- **Ops manual dobrada** — backup, rotação de chave e monitoramento agora em dois lugares. O deploy em `main`→VPS começa manual (sem pipeline automatizado) — ver Fase 13.7 do roadmap.
- **O staging permanece com a exposição residual da ADR-0010** — esta ADR não a resolve; só redefine que ela deixa de ser "a" exposição de produção.

## Atualiza `07-decisoes-em-aberto.md`

O item "Hospedagem e infra de produção" já constava como resolvido (ADR-0008/0010) — esta ADR entra na mesma linha da lista de "Resolvidas", registrando a topologia final de dois ambientes.
