# RIPD — Relatório de Impacto à Proteção de Dados Pessoais

## Medição contínua de energia elétrica

> Produzido como remediação da issue #157 (épico #154, Fase 11 do
> `.claude/docs/roadmap.md`), a partir do achado ALTO do
> `.claude/docs/2026-08-05-conformidade-audit.md` (LGPD Art. 38, Art. 10
> §3º). Depende de `.claude/docs/ROPA.md` (issue #156) — as operações
> avaliadas aqui são as mesmas registradas lá (itens 3 e 4).
>
> **Não é parecer jurídico.** Este é um checklist de engenharia informado
> pela lei. A conclusão da seção "Necessidade e proporcionalidade" informa
> a política de retenção de `MeterReading` da **Fase 15** do roadmap — hoje
> uma decisão de armazenamento/performance, não mais de conformidade
> (ADR-0014, ver §6.1).
>
> **Data de referência:** 2026-08-06 · commit da branch `feat/154-bloqueadores-conformidade-lgpd`.
>
> ⚠️ **Projeto de portfólio, permanentemente** ([ADR-0014](adr/0014-ambientes-permanentemente-demonstracao.md))
> — mesma ressalva de `PROCEDIMENTO_DIREITOS_TITULAR.md` e `ROPA.md`: não há
> e não haverá titulares reais nos ambientes publicados deste projeto. Este
> RIPD avalia o tratamento **como o código o implementa**, para que a
> avaliação já esteja pronta no dia em que um fork operar com dados reais.

## 1. Por que este tratamento exige RIPD

LGPD Art. 38: a ANPD pode exigir relatório de impacto quando o tratamento
tiver por fundamento o legítimo interesse, ou quando envolver **alto risco
aos titulares** — inclusive por monitoramento em larga escala de
comportamento. O regime de agente de pequeno porte (Res. CD/ANPD 2/2022)
simplifica o registro (ROPA), mas **não dispensa** a avaliação de impacto
quando o risco existe de fato.

O risco aqui não é hipotético: a cadeia de chaves estrangeiras do schema
(`backend/prisma/schema.prisma`) liga, de forma determinística, uma leitura
elétrica de minuto em minuto a uma pessoa identificada:

```
MeterReading → Meter → (Property | Area | Device) → Property → User
```

`User` guarda CPF/CNPJ e `Property` guarda o endereço do imóvel. Ou seja: o
sistema é capaz de produzir, para qualquer titular, uma série temporal de
consumo elétrico minuto a minuto associada ao nome, ao CPF e ao endereço
residencial — isso é, por definição, monitoramento sistemático de
comportamento em escala (todo usuário cadastrado, não uma amostra).

## 2. Descrição do tratamento avaliado

Detalhamento completo em `ROPA.md`, operações 3 (medição e consumo) e 4
(alertas). Resumo funcional, do ponto de ingestão à leitura:

1. O medidor IoT do titular emite amostras elétricas (tensão, corrente,
   potência ativa, fator de potência) em alta frequência — o intervalo real
   depende do protocolo e do dispositivo, tipicamente da ordem de segundos.
2. `MinuteBuffer` (`backend/src/modules/iot/iot-worker/MinuteBuffer.ts`)
   acumula as amostras no balde do minuto corrente, ponderando cada uma
   pelo tempo de vigência (`deltaSeconds`) — não é uma média simples, é uma
   média ponderada por tempo.
3. `MinuteRollupScheduler`
   (`backend/src/modules/iot/iot-worker/MinuteRollupScheduler.ts`) persiste
   periodicamente os baldes fechados como uma linha em `MeterReading`, via
   upsert idempotente (`secondsCovered` permite merge caso o rollup rode
   mais de uma vez sobre o mesmo minuto).
4. Enquanto a leitura acontece, o mesmo dado (não a linha persistida) é
   também transmitido ao vivo por SSE (RF11) para o painel do usuário
   autenticado — é o que dá a sensação de "tempo real".
5. Sempre que a potência sai da faixa configurada por um `Alert` do
   titular, o episódio de disparo (início, fim, duração, estatísticas) é
   persistido como `AlertTriggerEvent` ao final do episódio.
6. `MeterReading` fica retido **indefinidamente** hoje — não há prazo de
   expurgo configurado para esta tabela (ver ROPA.md, item 3, e seção 3
   abaixo). O mesmo vale para `AlertTriggerEvent`.

## 3. Necessidade e proporcionalidade da granularidade por minuto

Esta é a pergunta central da issue: **por que reter por minuto, e não a
cada 15 minutos (ou mais grosso)?** A resposta precisa separar duas
decisões que o schema atual funde numa só tabela, mas que servem
propósitos diferentes.

### 3.1 A coleta por minuto é justificada — pela ingestão, não pela retenção

RF10 (`.claude/project_context/02-requisitos.md`) exige que o sistema
"agregue amostras elétricas em leituras por minuto, com médias ponderadas
por tempo de vigência de cada amostra". Isso tem uma razão técnica sólida:
sem um balde de agregação, uma média simples sobre amostras chegando em
intervalos irregulares (dependendo do protocolo/dispositivo) distorceria o
resultado — a ponderação por `deltaSeconds` no `MinuteBuffer` é o que
produz uma leitura estável. RF11 (painel em tempo real via SSE) também
depende de um ciclo curto de atualização — um balde de 15 minutos
produziria uma experiência de "tempo real" perceptivelmente não-real.

**Conclusão parcial:** a granularidade de **coleta/ingestão** por minuto é
necessária e proporcional aos RF10/RF11 que ela serve.

### 3.2 A retenção indefinida por minuto NÃO tem o mesmo fundamento

RF12 — a única funcionalidade do produto que consulta o histórico
persistido — é explícito: "o sistema deve permitir que um usuário consulte
consumo (kWh) agregado por **hora, dia, mês ou ano**". Isso é confirmado
pelo próprio contrato de API:
`backend/src/modules/consumption/consumption.schema.ts` define
`granularitySchema = z.enum(["hour", "day", "month", "year"])` — **nenhuma
granularidade mais fina que "hora" é exposta por nenhuma funcionalidade do
produto**, hoje ou nos requisitos documentados. O painel "tempo real"
(RF11) não lê `MeterReading` — ele consome o stream SSE diretamente, sem
persistir o detalhe de minuto além do que o rollup já grava.

Ou seja: uma vez que o `MeterReading` de um minuto já foi incorporado a um
agregado por hora (o que acontece continuamente, é só uma soma/média sobre
a mesma tabela), **nenhum requisito de produto volta a precisar da linha
de minuto individual**. A única razão pela qual ela continua existindo
indefinidamente hoje é a ausência de um passo de compactação — não uma
necessidade funcional.

> **Atualização — premissa mudou.** A issue #226 (épico #225) adicionou
> `"minute"` ao `granularitySchema` e a UI passou a consultar histórico por
> minuto na janela da hora corrente (aba "Hora" do painel de consumo). A
> frase acima — "nenhuma granularidade mais fina que hora é exposta por
> nenhuma funcionalidade do produto" — não é mais verdadeira: RF12 agora é
> servido, em parte, por uma consulta que **lê** a granularidade de minuto
> diretamente, não só a agrega internamente. Isso não derruba a
> recomendação de retenção limitada do §3.3 por si só — pelo contrário, o
> fundamento mudou de "o dado de minuto nunca é consultado" para "o dado de
> minuto é consultado numa janela curta (a hora corrente)", um argumento
> mais forte para um prazo de retenção curto, não mais fraco.
>
> **Reavaliação (2026-08-23, ADR-0014):** sem titular real nos ambientes
> publicados, a pergunta "o prazo de 60–90 dias continua adequado?" deixou
> de ser uma questão de conformidade — não há titular cujo perfil
> comportamental precise de limite legal. A recomendação abaixo passa a ser
> uma sugestão de **armazenamento/performance** para a **Fase 15**
> (`meter_readings` é a maior tabela do sistema e cresce indefinidamente),
> não mais um prazo LGPD a cumprir. Issue #236 (que levantou esta pergunta)
> foi reclassificada de conformidade para desempenho com essa conclusão.
>
> **Decisão final (2026-08-24):** o prazo é **365 dias**, não os 60–90
> sugeridos acima. A instrumentação mediu o crescimento real pela primeira
> vez: ~2 GiB/ano para os 11 medidores da demo, um teto **conhecido e
> estável** (a ADR-0014 fixou os ambientes como permanentemente sintéticos
> — o número não escala com adoção de usuário real, só com o tempo
> corrido). Nesse patamar, o argumento de custo de armazenamento por si só
> é fraco; a escolha de manter um ano inteiro de granularidade fina é
> deliberada — folga generosa sobre a janela de 60–90 dias que já bastava
> para contestação de fatura/suporte técnico, não uma necessidade imposta
> pelo orçamento de disco.
>
> **Correção de escopo:** uma versão anterior desta nota também justificava
> os 365 dias como "mantém a opção de comparação minuto a minuto ano contra
> ano no futuro". Isso não se sustenta com o desenho implementado: a janela
> é **rolante** (expurgo diário mantém sempre "os últimos 365 dias", não um
> calendário fixo), então dois pontos no tempo separados por um ano nunca
> coexistem na tabela, exceto por poucos dias na borda exata da janela. Uma
> comparação ano a ano de verdade exigiria um desenho diferente (ex.:
> retenção por calendário, ou um agregado separado) — não decidido aqui e
> não implementado por #267. Removido como justificativa; os 365 dias
> continuam a decisão, sustentados pelo custo trivial e pela folga sobre a
> janela mínima necessária.

### 3.3 Conclusão e recomendação — decidido

**A granularidade de minuto não se justifica pelo RF12** (que só consulta
hora/dia/mês/ano) **nem pela aba "Hora"** (que só olha a hora corrente,
qualquer que seja o tamanho da janela de retenção — reavaliado nesta issue:
estender o prazo não muda nenhuma exposição da UI, porque a consulta
sempre pede a mesma janela curta). Sem titular real (ADR-0014), isto não é
mais uma recomendação de conformidade a validar com apoio jurídico — é uma
decisão de desenho de armazenamento tomada com número medido, não estimado:

- `MeterReading` é retida em granularidade de minuto por **365 dias**
  (`DATA_RETENTION_METER_READING_DAYS`) — cobre com folga a janela de
  contestação de fatura e investigação de suporte técnico que motivou a
  faixa original de 60–90 dias, e mantém um ano completo de detalhe fino a
  um custo medido e trivial (~2 GiB/ano, ver
  `.claude/docs/2026-08-24-baseline-desempenho.md` §4).
- **O que foi de fato implementado é expurgo definitivo (`DELETE`), sem
  nenhuma compactação.** Não existe hoje um agregado por hora/dia
  persistido — `MeterReading` é a única tabela de consumo do schema; o
  agregado que o painel mostra é calculado sob demanda, a cada requisição,
  a partir das próprias linhas de minuto (`ConsumptionRepository`). Passados
  os 365 dias, a linha de minuto é apagada e **nenhuma forma agregada dela
  sobrevive** — não há "reter só o que já foi somado" para reaproveitar
  depois. Se um agregado persistido (materialização por hora/dia) vier a
  ser construído no futuro, é um componente novo — exige ADR
  (`03-arquitetura.md`) e uma reavaliação desta seção antes de ir ao ar.

O benefício de reter menos não é mais o custo de disco — é o custo de
query em `meter_readings`: medição registrada no laudo de desempenho de
2026-08-22 (achado A-01) mostra `findAggregated` fazendo `Parallel Seq
Scan` proporcional ao tamanho da tabela. 365 dias mantém a tabela ordens
de grandeza menor do que "indefinidamente", que é o que o laudo sinalizou
como problema — não elimina o achado, mas o limita a um teto conhecido.

## 4. Riscos aos titulares

| Risco | Mecanismo |
|---|---|
| Inferência de presença/ausência | Quedas e retomadas de consumo em `MeterReading`/`AlertTriggerEvent` revelam quando a residência está ocupada. |
| Inferência de rotina (sono, trabalho, hábitos) | Padrão diário recorrente de consumo por minuto/hora é uma assinatura comportamental razoavelmente estável. |
| Inferência do número de ocupantes | Picos de consumo simultâneo (múltiplos aparelhos) correlacionam com quantas pessoas estão na residência. |
| Uso por terceiros com interesse comercial adverso ao titular | Seguradoras (perfil de risco residencial), credores/cobradores (indício de dificuldade financeira por padrão de consumo atípico), ou qualquer parte interessada em saber a rotina de alguém — nenhum desses é uma finalidade do LumiTrack, mas é o tipo de uso que um vazamento ou um pedido indevido de acesso viabilizaria. |
| Exposição em caso de vazamento | Como o dado liga consumo a CPF e endereço, um vazamento de `meter_readings` + `users` + `properties` é equivalente a vazar "quando a casa de uma pessoa identificada está ocupada" — um dos perfis de dado mais sensíveis para segurança física do titular, mesmo não sendo uma categoria de dado sensível no sentido do Art. 5º, II da LGPD. |

## 5. Salvaguardas já existentes

Cada item abaixo foi **verificado no código nesta execução**, não copiado
do ROPA sem checar (a razão está registrada no CHANGELOG desta branch: um
erro factual já foi cometido e corrigido no ROPA sobre a cifra de
endereço).

- **Cifra em repouso com chaves segregadas por categoria:** CPF/CNPJ
  (AES-256-GCM, `shared/crypto/encryption.ts`) e endereço/cidade/estado/CEP
  (AES-256-GCM, chave própria `ADDRESS_ENCRYPTION_KEY`,
  `shared/crypto/addressEncryption.ts`) usam chaves independentes entre si
  — comprometer uma não expõe a outra.
- **Blind index para busca sem descriptografar:** `cpfBlindIndex`/
  `cnpjBlindIndex` (HMAC-SHA256 determinístico) garantem unicidade e busca
  por igualdade sem manter o valor em claro indexável.
- **Autorização por posse consistente:** verificado nos três services que
  compõem a cadeia deste tratamento —
  `backend/src/modules/meter/meter.service.ts` (`assertOwnership`, resolve
  o dono subindo a hierarquia até `Property`), `alert.service.ts`
  (`getOwnedAlert`) e `property.service.ts` (checagem direta de
  `property.userId`) — todos lançam `ForbiddenError` quando o `userId` da
  requisição não bate com o dono do recurso.
- **MFA opcional (TOTP + backup codes):** reduz o risco de acesso à conta
  por credencial comprometida, o que mitigaria a exposição deste dado a um
  atacante que só tenha a senha.
- **Trilha de auditoria:** login, logout, acesso negado e export ficam
  registrados em `audit_logs`, com `metadata` limitado a nomes de campo
  (nunca valores) desde a issue #149 — permite reconstruir quem acessou o
  quê em caso de investigação.
- **Expurgo agendado — parcial:** o `RetentionService` já existe e já
  purga automaticamente 4 entidades de credencial (`auth_tokens`,
  `refresh_tokens`, `password_resets`, `audit_logs` após 730 dias). **Isto
  não é uma salvaguarda para o dado avaliado neste RIPD** —
  `meter_readings` e `alert_trigger_events` não estão entre as entidades
  cobertas (ver risco residual 6.1, abaixo). Registrado aqui só para deixar
  explícito o que o mecanismo já faz, sem estender por engano a cobertura
  dele a este tratamento.

## 6. Riscos residuais e plano de tratamento

| # | Risco residual | Tratamento planejado |
|---|---|---|
| 6.1 | `meter_readings`/`alert_trigger_events` sem prazo de retenção — crescem indefinidamente. Sem titular real (ADR-0014), isso deixa de ser risco de perfil comportamental exposto e passa a ser uma questão de **armazenamento/performance** (a maior tabela do sistema). | **Fechado — implementado (2026-08-24).** `RetentionService` estendido: `MeterReading` expurgada por `minuteStart` (365 dias) e `AlertTriggerEvent` por `createdAt` (365 dias) — expurgo definitivo (`DELETE`), sem compactação nem agregado persistido (ver §3.3). Sem prazo LGPD a cumprir — decisão de custo/performance, não de conformidade. |
| 6.2 | `Meter.extra` (configuração de conexão do dispositivo) podia conter a senha do medidor em texto claro no JSON. | **Fechado.** Corrigido pela issue #182: `shared/crypto/meterCredentialEncryption.ts` cifra `extra.password` (AES-256-GCM, chave própria `METER_CREDENTIAL_ENCRYPTION_KEY`); `MeterResponse` nunca expõe a senha (só `passwordSet: boolean`). Coberto por teste dedicado (`meterCredentialEncryption.test.ts`, `meter.repository.test.ts`). |
| 6.3 | Transferência internacional do staging (Render/Neon, registros de acesso de visitante, sem SCC). | **Aceito permanentemente — [ADR-0014](adr/0014-ambientes-permanentemente-demonstracao.md).** Deixa de ser "a reavaliar quando abrir cadastro real" (esse cadastro não vai abrir) e passa a ser risco assumido de forma explícita e definitiva enquanto o staging existir com esse papel. A produção (VPS) segue sem transferência internacional (ADR-0008/0012). |
| 6.4 | Base legal específica desta operação (hoje "execução de contrato", registrada no ROPA) ainda não passou por revisão jurídica formal. | **Deferido — ADR-0014.** Atribuição formal com revisão jurídica só se justifica havendo titular real; não é trabalho ativo enquanto os ambientes forem demonstração. |
| 6.5 | Sem DSAR (Data Subject Access Request) completo — a exportação hoje existente (`GET /api/users/me/data-export`) não inclui consumo agregado (`MeterReading`) nem disparos (`AlertTriggerEvent`). | **Deferido — ADR-0014.** Sem titular real, não há obrigação de Art. 18 a cumprir nem urgência de produto. |

Nenhum destes riscos foi tratado pela issue #157 (origem deste RIPD) — ela
entrega a avaliação, não a correção. 6.1 e 6.2 já foram corrigidos por
issues próprias; 6.3, 6.4 e 6.5 são deferidos pela ADR-0014 enquanto os
ambientes forem permanentemente demonstração.

## 7. Reavaliação

Este RIPD deve ser revisado sempre que houver mudança material no modelo
de dados ou no fluxo de tratamento avaliado aqui — no mínimo: alteração da
granularidade de coleta ou retenção de `MeterReading`, novo campo pessoal
adicionado à cadeia `MeterReading → ... → User`, mudança de finalidade do
tratamento de alertas, ou mudança na topologia de hospedagem decidida pela
ADR-0008 (a revisão de 2026-08-06 já incorporou essa decisão em 6.3, a
revisão de 2026-08-23 incorporou a ADR-0014, e a revisão de 2026-08-24
fechou 6.1 com o desenho final — expurgo definitivo, sem compactação, ver
§3.3). **Se algum dia um agregado por hora/dia persistido vier a ser
construído**, esta seção volta a precisar de revisão — o item 6.1 e a §3.3
descrevem hoje um estado sem esse componente, e introduzi-lo muda tanto o
risco quanto o texto. Se, ao contrário, o próprio projeto decidir abrir
cadastro real um dia (não planejado, ADR-0014), este RIPD inteiro precisa
ser reavaliado como parte da auditoria de conformidade exigida antes
disso — não só a seção 3.3.
