# ADR-0011 — Keep-alive da demo: monitor externo (UptimeRobot) como ping primário

- **Data:** 2026-08-21
- **Status:** **substituída pela ADR-0013** (2026-08-23)
- **Branch/Issue relacionada:** issue #229, épico #225 (achados de uso real pós-deploy)
- **Relação com outras ADRs:** aplica-se exclusivamente ao **Caminho A** (demo pública, ADR-0010). Não se aplica ao Caminho B (ADR-0008 + ADR-0009), que preserva zero operador estrangeiro por desenho.

> **Substituída pela [ADR-0013](0013-fim-do-keep-alive-staging-hiberna-por-desenho.md).** A ADR-0012 rebaixou este ambiente de demo pública a staging/validação, e um ambiente de validação acordado 24/7 não tem beneficiário — os dois mecanismos de keep-alive foram removidos.
>
> **O que continua valendo desta ADR:** o raciocínio da seção "Decisão" sobre um monitor externo em `/health` **não configurar transferência internacional de dado pessoal**. Ele não foi revertido — o keep-alive saiu por falta de propósito, não por falha do argumento — e é o precedente sobre o qual a Fase 14 avalia adotar um monitor externo para a **produção**, fechando a lacuna de detecção que a ADR-0009 aceitou como custo.

## Contexto

O `.github/workflows/keep-alive.yml` faz `GET /health` a cada 10 min para manter o `lumitrack-api` do Render fora da janela de hibernação de 15 min (free tier, ADR-0010). A issue #222 (fechada) diagnosticou que o `schedule` do GitHub Actions **descarta execuções sob carga**, não só atrasa — comportamento documentado do produto, não bug de configuração — e mitigou deslocando o cron para minutos não-redondos (`7,17,27,37,47,57`), reduzindo a colisão com o volume maior de workflows agendados em minutos redondos.

A mitigação reduziu a chance de descarte, mas não a eliminou: gaps acima de 15 min entre pings continuam ocorrendo, cada um custando um cold start de ~60–90s para quem encontra a demo nesse intervalo (ex.: um recrutador avaliando o portfólio). Faltava um mecanismo de agendamento com SLA melhor que o do Actions.

## Decisão

**UptimeRobot** (free tier, sem cartão) passa a ser o **ping primário**, batendo em `https://lumitrack-api.onrender.com/health` a cada 5 min. O workflow do GitHub Actions **é mantido como redundância** — dois mecanismos de agendamento independentes reduzem a chance de os dois falharem no mesmo intervalo, e o Actions já está implementado e não custa nada manter.

**Este endpoint não processa dado pessoal**, por isso a decisão não abre a tabela de operadores do `ROPA.md` nem aciona o gate de DPA/SCC descrito lá ("Gate obrigatório ao adotar qualquer operador novo"):

- `/health` é público, sem autenticação, e devolve só um status — nenhum dado de visitante é lido ou processado para respondê-lo.
- `/health` está **explicitamente excluído do log de acesso** (`backend/src/app.ts`) — o ping do monitor não gera registro de IP nem qualquer outro dado.
- O fluxo é o inverso de um operador típico: é o UptimeRobot que **envia** a requisição e **recebe** um código HTTP — não há dado pessoal de titular algum viajando do LumiTrack para o UptimeRobot.

Isso distingue esta decisão da cautela da ADR-0009 (que evitou monitor externo no Caminho B mesmo para `/health`, por ali "zero operador estrangeiro" ser o próprio objetivo de desenho, não uma questão de haver ou não dado pessoal em trânsito). No Caminho A esse objetivo não existe — a ADR-0010 já aceitou Render e Neon como operadores estrangeiros, com a exposição real (registros de acesso de visitantes) registrada no `ROPA.md`. Adicionar um serviço que não processa dado pessoal nenhum é um incremento de risco menor que o que a ADR-0010 já assumiu deliberadamente.

## Alternativas consideradas

- **Render Starter (~US$ 7/mês)** — eliminaria a hibernação de vez, a única correção realmente definitiva. Descartada por ora: custo recorrente para um ambiente de portfólio sem usuário real, quando a redundância de agendamento resolve o problema prático (gaps grandes) sem custo.
- **cron-job.org** — mesmo racional de conformidade do UptimeRobot (nenhum dado pessoal em trânsito), mas alertas e histórico mais limitados no free tier. Preterido por facilidade de configurar alerta e por ser mais documentado/usado — mais fácil achar ajuda se o agendamento falhar.
- **Better Stack** — free tier historicamente decrescente (maior risco de precisar trocar de fornecedor depois). Preterida por estabilidade do plano gratuito.
- **Ping no carregamento da landing page** — complementar, não substitui: não cobre o primeiro visitante depois de horas de silêncio (é reativo ao próprio tráfego que se quer evitar penalizar). Não implementado nesta ADR; fica como possível reforço futuro, não como mecanismo principal.
- **Self-ping do backend** (`setInterval` interno) — descartada sem análise de custo/benefício: uma instância já hibernada não executa nada, então não se acorda sozinha. Não resolve o problema por construção.

## Consequências

**Positivas**

- Intervalo de checagem menor (5 min vs. 10 min) e agendamento com SLA melhor que o `schedule` do GitHub Actions.
- Dois mecanismos independentes (UptimeRobot + Actions) — a falha de um não deixa a demo sem nenhum ping.
- Sem cartão, sem custo recorrente, sem novo operador de dado pessoal (ver "Decisão").
- UptimeRobot também alerta o autor por e-mail/Telegram quando `/health` para de responder — sinal que o Actions sozinho não dava (o workflow só registra um `::warning::` no próprio Actions, que ninguém olha proativamente).

**Negativas/custos aceitos**

- **Ainda não elimina a hibernação** — só reduz a frequência e a duração dos gaps. Cold start de ~60–90s continua possível caso os dois mecanismos falhem na mesma janela (menos provável, mas não impossível). Se isso se mostrar insuficiente na prática, a correção definitiva é o upgrade pago do Render — não avaliado aqui por falta de necessidade demonstrada ainda.
- **Novo serviço externo a manter** (conta UptimeRobot) — sem dado pessoal em trânsito, mas ainda é uma peça a mais de infraestrutura fora do repositório, sem versionamento (a configuração do monitor vive no painel do UptimeRobot, não em código).
- **Config do monitor é manual e fora do controle do agente** — criar a conta e cadastrar o monitor é passo humano, documentado em `DEPLOY.md`, não automatizável por esta mudança.
