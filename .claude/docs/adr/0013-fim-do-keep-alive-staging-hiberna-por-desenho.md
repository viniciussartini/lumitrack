# ADR-0013 — Fim do keep-alive: o staging hiberna por desenho

- **Data:** 2026-08-23
- **Status:** aceita
- **Branch/Issue relacionada:** branch `chore/pendencias-e-remocao-keep-alive`
- **Relação com outras ADRs:** **substitui a ADR-0011** (keep-alive via UptimeRobot). Consequência direta da **ADR-0012** (separação de ambientes), que mudou o papel do ambiente Render+Neon. Não altera a ADR-0010 (a plataforma continua a mesma) nem a ADR-0009 (observabilidade da produção).

## Contexto

A ADR-0011 e o `.github/workflows/keep-alive.yml` existiam para manter o `lumitrack-api` do Render acordado 24/7, contra a hibernação por inatividade de 15 min do free tier. A justificativa era inteiramente do papel que aquele ambiente tinha à época: era **a demo pública de portfólio** (ADR-0010) — a URL que um recrutador abriria sem aviso, onde um cold start de 60–90s no primeiro clique é um custo real de primeira impressão.

**A ADR-0012 mudou esse papel.** A produção real passou a ser a VPS Hostinger, servindo a branch `main` sob domínio próprio. O ambiente Render+Neon foi rebaixado a **staging/validação**: existe para exercitar um PR online antes da promoção para `main`, e seu público é o próprio autor, num momento em que ele sabe que está validando.

Um ambiente de validação acordado 24/7 não tem beneficiário. Ninguém chega nele por acaso — não é a URL divulgada, não é o que o portfólio aponta. O que era proteção de primeira impressão virou custo sem contrapartida, e a auditoria de conformidade de 2026-08-22 já havia registrado esse custo pelo lado que importa: o keep-alive mantinha o ambiente processando 24/7 (e retendo registro de acesso) sem que houvesse uso real correspondente.

## Decisão

**Os dois mecanismos de keep-alive são removidos. O staging hiberna após 15 min de inatividade, por desenho, e isso deixa de ser tratado como problema.**

- O monitor do UptimeRobot foi desativado pelo autor em 2026-08-23.
- O `.github/workflows/keep-alive.yml` é removido do repositório por esta mudança.

O cold start de ~60–90s no início de cada sessão de validação passa a ser comportamento esperado e aceito, não um incidente a mitigar.

**O raciocínio jurídico da ADR-0011 não é revertido — apenas deixa de ter aplicação.** Ela estabeleceu que um monitor externo batendo em `/health` **não configura transferência internacional de dado pessoal**: `/health` é público, sem autenticação, devolve só um status, está excluído do log de acesso (`backend/src/app.ts`, `autoLogging.ignore`), e o fluxo é o inverso do de um operador — o monitor envia a requisição e recebe um código HTTP, sem que dado de titular algum viaje do LumiTrack para ele. Essa leitura continua válida e permanece disponível como precedente: a Fase 14 avalia adotar um monitor externo para a **produção** (a lacuna de detecção registrada como custo aceito na ADR-0009 — o Uptime Kuma auto-hospedado cai junto com a VM que deveria vigiar), e é sobre este parágrafo que aquela avaliação se apoia. O keep-alive foi retirado por falta de propósito, não por falha do argumento.

## Alternativas consideradas

- **Manter só o workflow do Actions, removendo o UptimeRobot** — reduziria pela metade sem resolver: a pergunta não é qual mecanismo mantém o ambiente acordado, é se manter acordado serve para alguma coisa. Descartada por não atacar a causa.
- **Manter o keep-alive só durante janelas de validação** (acionado manualmente antes de testar um PR) — o `workflow_dispatch` já permitia isso, mas resolve um problema que não existe: quem valida pode simplesmente esperar o cold start, que é mais curto que o próprio ciclo de validação.
- **Upgrade pago do Render (Starter, ~US$ 7/mês)** — elimina a hibernação de vez. Descartada de novo, e agora com folga: pagar para manter acordado um ambiente que ninguém visita é o oposto do que esta ADR conclui.

## Consequências

**Positivas**

- **Reduz materialmente o achado Alto de conformidade de 2026-08-22** (registro de acesso de visitante retido por 730 dias num ambiente ligado 24/7): o staging só processa requisição enquanto alguém de fato o está usando. Não fecha o item de retenção — a política de prazo continua sendo escopo da Fase 14 / issue #236 — mas remove o acúmulo contínuo que corria sem uso.
- **Tira o relógio da pressão de volume no Neon.** O simulador só gera leitura enquanto o serviço está acordado; com a hibernação restaurada, `meter_readings` para de crescer em torno do relógio, e o limite de 0,5 GB do free tier deixa de ter data para estourar.
- Uma peça a menos de infraestrutura fora do repositório (conta UptimeRobot) e um workflow agendado a menos.
- A cota de 750 horas-instância/mês do Render deixa de ser consumida continuamente.

**Negativas/custos aceitos**

- **Cold start de ~60–90s no início de cada sessão de validação.** Aceito: quem espera é o autor, que sabe que está validando.
- **O staging fica sem nenhum monitoramento de disponibilidade.** O UptimeRobot não fazia só o keep-alive — também alertava quando `/health` parava de responder. Aceito: o staging não é um serviço do qual alguém dependa, e uma queda lá é descoberta no próprio momento em que se vai usá-lo.
- **Gate de reversão:** se este ambiente voltar a ser divulgado como demo pública de portfólio, ou se qualquer visitante passar a ser esperado nele sem aviso, esta decisão precisa ser reavaliada — a justificativa inteira da ADR-0011 volta a valer nesse cenário.
