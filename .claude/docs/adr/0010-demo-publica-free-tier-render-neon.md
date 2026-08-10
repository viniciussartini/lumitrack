# ADR-0010 — Demo pública em free tier (Render + Neon), com escopo restrito a demonstração

- **Data:** 2026-08-09
- **Status:** aceita
- **Branch/Issue relacionada:** Fase 13.5 do roadmap (épico #187)
- **Relação com outras ADRs:** **substitui parcialmente a ADR-0008** — troca o provedor e, com ele, a conclusão de conformidade daquela decisão. Preserva a topologia lógica, a **condição de validade** (cadastro público fechado) e os **sete gates de go-live**.

## Contexto

A ADR-0008 escolheu a Oracle Cloud Always Free (São Paulo) por ser, no levantamento de 2026-08-06, a única opção que combinava **região Brasil + always-on + custo zero**. Ao partir para o deploy real, dois fatos mudaram a decisão:

1. **A Oracle exige cartão de crédito** para verificação de identidade mesmo no Always Free (não há cobrança, mas o dado precisa ser informado). Requisito novo do autor: não informar dados de pagamento.
2. **O cenário de free tier degradou.** Re-verificação em **2026-08-09**:

| Opção | Cartão? | Always-on? | Região BR? | Situação verificada |
|---|---|---|---|---|
| Fly.io | Sim | Sim | Sim (GRU) | **Free tier extinto em 2024** — hoje é trial de 2h/7 dias. Era a "alternativa recomendada" da ADR-0008; deixou de existir. |
| Koyeb | Provável | **Não** — hiberna após 1h, não desligável | Não | Starter fechado para contas novas. |
| Oracle Always Free | **Sim** | Sim | Sim (SP) | Tecnicamente continua válida — só o cartão a desqualifica. |
| **Render** | **Não** | **Não** — hiberna após 15 min | Não | Docker, deploy por blueprint versionado, site estático que não hiberna. **PostgreSQL próprio expira em 30 dias** — inutilizável. |
| **Neon** (só banco) | **Não** | Autosuspend | Sim, mas irrelevante aqui | 0,5 GB, sem expiração. |

**Não existe free tier que combine always-on + região Brasil + sem cartão.** Uma das três restrições tem de ceder.

### O que decidiu qual restrição cede

**A região cede, porque o escopo do ambiente é demonstração.** Este repositório é portfólio: o ambiente publicado roda **exclusivamente** com as duas contas sintéticas do `backend/prisma/seed-demo/` (CPF/CNPJ matematicamente válidos porém nunca emitidos, e-mails em domínio inexistente) e com o **cadastro público fechado**. Não há usuário real, logo não há dado pessoal de titular real no produto.

Se e quando o projeto abrir cadastro para pessoas reais, a hospedagem **migra para o Brasil** antes disso — e essa migração já está pronta no repositório (ver "Compromisso de migração").

## Decisão

**A demo pública roda no Render (site estático + web service Docker) com PostgreSQL no Neon.** Ambos gratuitos, sem cartão de crédito, com deploy declarado em `render.yaml` versionado.

Três consequências de desenho são **forçadas pela plataforma**, não preferências:

1. **Backend e `iot-simulator` no mesmo container** (`Dockerfile` na raiz + `deploy/demo-entrypoint.sh`). Background workers não fazem parte do plano gratuito do Render, e serviços Render expõem apenas HTTPS — nunca TCP bruto. Como o backend conversa com o simulador por **MQTT na porta 1883**, dois serviços separados não conseguiriam se falar. Efeito colateral desejável: do ponto de vista do backend o simulador continua em loopback, preservando `IOT_ALLOWED_HOSTS=127.0.0.1/32` e o `DEMO_METER_HOST=localhost` do seed sem alteração.
2. **Rewrite `/api/*` no site estático apontando para o web service.** O frontend chama a API por caminho relativo (`services/api.ts`, `lib/sse/appStream.ts`). O rewrite mantém tudo na mesma origem do ponto de vista do browser, preservando **sem uma linha de mudança** o cookie de sessão `HttpOnly`, o CSRF double-submit e a diretiva `connect-src 'self'` da CSP. Servir a API em outro domínio exigiria `SameSite=None` e reescreveria o modelo de sessão inteiro.
3. **Bootstrap automático dos devices do simulador no boot** (`DEMO_BOOTSTRAP_ENABLED`, `iot-simulator/server/src/simulation/demoBootstrap.ts`). O `SimulationStore` é em memória e o serviço hiberna após 15 min; sem isso, todo despertar traria o simulador vazio e o painel sem dado ao vivo.

**Cold start de ~60–90s na primeira visita é aceito** (decisão do autor). O site estático não hiberna, então a interface carrega instantaneamente — só os dados esperam a API acordar.

O banco **não** é o PostgreSQL do Render: o gratuito expira 30 dias após a criação, o que exigiria recriar o banco todo mês. O Neon não expira.

## Consequência de conformidade — o que muda de verdade

A ADR-0008 podia afirmar "não há transferência internacional de dados pessoais" por **inexistência do fato gerador**. Isso **deixa de ser verdade** e precisa ser dito sem rodeio:

- **Dados das contas de demonstração:** sintéticos, sem titular. Não são dado pessoal, logo não há transferência internacional **deles**. Essa parte da conclusão da ADR-0008 sobrevive.
- **Porém: IP e registros de acesso de visitantes reais são dado pessoal**, e passam a ser tratados no exterior (Render, EUA; Neon, região a definir). Isso **é** transferência internacional nos termos do Art. 33 da LGPD — mínima em volume e sensibilidade, mas real. A própria ADR-0008 já reconhecia esse ponto ao descartar CDN de borda por processar "o IP do visitante (dado pessoal) em servidores no exterior".
- **O projeto não celebra SCCs** (Res. CD/ANPD 19/2024) com Render ou Neon, e não há decisão de adequação para os EUA.

**A posição registrada, portanto, não é "está em conformidade".** É: a exposição residual se limita a registros de acesso de visitantes de um ambiente de demonstração sem contas reais, e isso é **risco assumido de forma explícita** — precisamente o motivo de o ambiente ser restrito a demonstração e de existir o compromisso abaixo.

Reflexos obrigatórios, feitos junto com esta ADR (um aviso de privacidade que afirme algo falso é pior que nenhum):

- `frontend/src/legal/privacy-policy.md` § 4 — deixa de afirmar "não realizamos transferência internacional"; passa a nomear os operadores e o país de processamento. Versão 1.1 → **1.2**, com `CURRENT_CONSENT_VERSION` incrementada em sincronia.
- `.claude/docs/ROPA.md` — a tabela de operadores deixa de estar vazia.
- `.claude/project_context/09-conformidade-legal.md` — transferência internacional deixa de ser "não se aplica".

### Condição de validade (herdada da ADR-0008, e mais crítica aqui)

Tudo acima depende de **o cadastro público estar efetivamente fechado**. `REGISTRATION_ENABLED` tem **default `true`** (`backend/src/config/env.ts`) — o cadastro **não** está fechado por padrão; ele fecha quando o ambiente de produção define `false` (fixado em `render.yaml`). Subir com o cadastro aberto faria pessoas reais inserirem dado pessoal real num ambiente fora do Brasil, e derrubaria toda a análise desta ADR no primeiro cadastro.

## Compromisso de migração

**Se o projeto passar a operar com usuários reais, a hospedagem migra para infraestrutura brasileira antes disso.** Não é intenção vaga: o caminho já está implementado e versionado neste repositório — `docker-compose.yml`, `deploy/Caddyfile`, `deploy/provision-vm.sh`, os scripts de backup e a ADR-0009 compõem o stack self-hosted descrito como **Caminho B** em `.claude/docs/DEPLOY.md`, e foi exatamente para isso que ele foi preservado.

Nesse momento voltam a valer integralmente a conclusão da ADR-0008 e os itens de `09-conformidade-legal.md` que hoje estão suspensos.

## Alternativas consideradas

- **Manter a Oracle Cloud Always Free** — grátis, always-on e em São Paulo, com a melhor postura de conformidade das opções. Descartada apenas pelo requisito de não informar cartão. Continua sendo o destino natural da migração prometida acima.
- **VPS brasileiro pago via PIX (~R$ 20/mês)** — avaliada e chegou a ser implementada nesta mesma sessão, depois revertida por decisão do autor: preservaria a conformidade integralmente, mas o projeto é portfólio e não justifica custo recorrente enquanto não houver usuário real.
- **Render + PostgreSQL do próprio Render** — descartada: o banco gratuito expira em 30 dias e não tem backup, o que obrigaria a recriar e re-semear o ambiente mensalmente.
- **Koyeb / Fly.io** — descartadas por indisponibilidade factual (ver tabela do contexto).

## Consequências

**Positivas**

- Sem cartão de crédito e sem custo recorrente.
- Deploy declarativo e versionado (`render.yaml`), com build direto do repositório — o critério de "fácil deploy" que motivou a revisão.
- Site estático não hiberna: a interface responde instantaneamente mesmo com a API fria.
- O caminho de volta para o Brasil fica pronto e documentado, em vez de virar dívida.
- Elimina o risco de capacidade ARM em São Paulo, que era o **maior risco externo** da Fase 13.5.

**Negativas e custos aceitos**

- **Passa a existir transferência internacional de dados pessoais** (registros de acesso), sem SCCs. Risco assumido e restrito a ambiente de demonstração — ver acima.
- **Cold start de ~60–90s** na primeira visita após 15 min de inatividade.
- **Backend e simulador acoplados na mesma imagem** para a demo — o `docker-compose.yml` mantém a separação correta para todos os outros ambientes, mas passam a existir dois artefatos de deploy a manter em sincronia.
- **Limite de 0,5 GB no Neon.** Resolvido na origem em 2026-08-09: o seed de demonstração deixou de gerar histórico (`backend/prisma/seed-demo/`, ver `.claude/docs/DEPLOY.md`) — cria só a topologia (11 medidores, submedição por cômodo/equipamento) e os alertas; todo `MeterReading` nasce da ingestão IoT real a partir do deploy. Ainda assim, o `RetentionService` não cobre `MeterReading` (item da Fase 14), então o crescimento das leituras ao vivo precisa de acompanhamento manual até lá.
- **750 horas-instância/mês** no Render, compartilhadas pela conta inteira — um segundo serviço gratuito concorreria pela mesma cota.
