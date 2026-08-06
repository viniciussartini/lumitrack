# RIPD — Relatório de Impacto à Proteção de Dados Pessoais

## Medição contínua de energia elétrica

> Produzido como remediação da issue #157 (épico #154, Fase 11 do
> `.claude/docs/roadmap.md`), a partir do achado ALTO do
> `.claude/docs/2026-08-05-conformidade-audit.md` (LGPD Art. 38, Art. 10
> §3º). Depende de `.claude/docs/ROPA.md` (issue #156) — as operações
> avaliadas aqui são as mesmas registradas lá (itens 3 e 4).
>
> **Não é parecer jurídico.** Este é um checklist de engenharia informado
> pela lei. A conclusão da seção "Necessidade e proporcionalidade" tem
> implicação direta na política de retenção da Fase 14 do roadmap — antes
> de tratá-la como definitiva, submeta a revisão jurídica.
>
> **Data de referência:** 2026-08-06 · commit da branch `feat/154-bloqueadores-conformidade-lgpd`.
>
> ⚠️ **Projeto de portfólio** — mesma ressalva de `PROCEDIMENTO_DIREITOS_TITULAR.md`
> e `ROPA.md`: não há titulares reais hoje. Este RIPD avalia o tratamento
> **como o código o implementa**, para que a avaliação já esteja pronta no
> dia em que um fork operar com dados reais.

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

### 3.3 Conclusão e recomendação (condiciona a Fase 14)

**A granularidade de minuto não se justifica para retenção além do
necessário para servir o agregado por hora e para uma janela de
troubleshooting/contestação de fatura de curto prazo.** Recomendação
concreta a ser avaliada (com apoio jurídico) na Fase 14 do roadmap, que já
lista a retenção de `MeterReading` como pendência:

- Manter `MeterReading` em granularidade de minuto por uma janela limitada
  (ordem de grandeza sugerida: 60–90 dias — suficiente para o titular
  contestar uma fatura recente e para suporte técnico investigar uma
  anomalia), e
- Após essa janela, compactar para um agregado horário (ou descartar a
  linha de minuto e reter só o que já foi somado em `MeterReading`
  agregada por hora/dia, conforme a Fase 14 decidir o desenho), eliminando
  a granularidade fina do dado retido a longo prazo.

Isso não é uma alteração de escopo desta issue (#157 entrega o relatório,
não a implementação) — é o **fundamento**, com base no requisito de
produto e não em conveniência técnica, que a Fase 14 precisa para não
escolher um prazo arbitrário.

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
| 6.1 | `meter_readings`/`alert_trigger_events` sem prazo de retenção — crescem indefinidamente, mantendo o perfil comportamental completo do titular por tempo indeterminado. | Fase 14 do roadmap ("Conformidade P1: retenção, DSAR, consentimento e documentos") — decisão de prazo com apoio jurídico, informada pela recomendação da seção 3.3 deste RIPD. |
| 6.2 | `Meter.extra` (configuração de conexão do dispositivo) pode conter a senha do medidor em texto claro no JSON. | Fase 13 do roadmap ("Endurecimento de segurança (P1)") já lista "cifra de `Meter.extra.password` + omissão do `MeterResponse`" como item planejado. |
| 6.3 | ~~Nenhuma decisão de hospedagem tomada — risco de exposição a jurisdição estrangeira somado ao risco comportamental.~~ **Tratado.** | **Resolvido pela ADR-0008** (issue #158): hospedagem própria em São Paulo, banco na mesma VM, sem operador estrangeiro — o dado comportamental avaliado neste RIPD não sai do Brasil. Risco remanescente **muda de natureza**: passa de jurisdicional para operacional (ponto único de falha, backup manual via `pg_dump`, ausência de redundância) — ver "Consequências negativas" da ADR-0008. |
| 6.4 | Base legal específica desta operação (hoje "execução de contrato", registrada no ROPA) ainda não passou por revisão jurídica formal. | Fase 14 do roadmap — atribuição de base legal por operação, com revisão jurídica (mesma ressalva já registrada em `ROPA.md`). |
| 6.5 | Sem DSAR (Data Subject Access Request) completo — a exportação hoje existente (`GET /api/users/me/data-export`) precisa ser conferida quanto a incluir o histórico de `meter_readings`/`alert_trigger_events` por inteiro, não só um resumo. | Fase 14 do roadmap lista "export DSAR completo (consumo agregado, medidores, disparos)" como item planejado — não verificado neste RIPD por estar fora do seu escopo (avaliação de impacto, não auditoria de export). |

Nenhum destes riscos é tratado por esta issue — #157 entrega a avaliação,
não a correção. Cada um já está alocado a uma fase específica do roadmap,
para que a análise não fique arquivada sem dono.

## 7. Reavaliação

Este RIPD deve ser revisado sempre que houver mudança material no modelo
de dados ou no fluxo de tratamento avaliado aqui — no mínimo: alteração da
granularidade de coleta ou retenção de `MeterReading`, novo campo pessoal
adicionado à cadeia `MeterReading → ... → User`, mudança de finalidade do
tratamento de alertas, ou mudança na topologia de hospedagem decidida pela
ADR-0008 (a revisão de 2026-08-06 já incorporou essa decisão em 6.3).
A revisão mais próxima e certa é a implementação
da recomendação da seção 3.3 na Fase 14 — nesse momento, este documento
deve ser atualizado para refletir o desenho final adotado (não deixá-lo
descrevendo um estado já superado).
