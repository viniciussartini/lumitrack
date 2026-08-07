# ADR-0008 — Hospedagem no Brasil (Oracle Cloud Always Free), sem operador estrangeiro

- **Data:** 2026-08-06
- **Status:** aceita
- **Branch/Issue relacionada:** issue #158, épico #154 (Fase 11 do roadmap)
- **Resolve:** o item "Hospedagem e infra de produção" de `.claude/project_context/07-decisoes-em-aberto.md`

## Contexto

A hospedagem estava em aberto desde o início do projeto — não havia nenhuma
config de deploy no repositório (nem Dockerfile, nem `vercel.json`, nem
`fly.toml`). A issue #158 exige tomá-la **como decisão de conformidade, não
só técnica**, porque é ela que determina se o produto passa a fazer
transferência internacional de dados pessoais (LGPD Art. 33-36, Res. CD/ANPD
19/2024 — o período de graça encerrou em agosto/2025).

O roadmap registra a razão de a decisão vir antes do deploy, e não depois:
avaliar região Brasil ou UE é *"a mitigação mais barata, porque elimina o
problema em vez de contratá-lo"*. Hoje o `privacy-policy.md` declara que não
há transferência internacional — e isso é verdade só porque o app não está
hospedado. **A declaração viraria factualmente falsa no dia do deploy**, se
ele fosse para um provedor estrangeiro.

Restrição adicional do projeto: é um **portfólio**, então o custo precisa ser
zero ou próximo de zero.

### Restrições técnicas levantadas (o que elimina metade das opções)

O backend **não é uma API REST sem estado** — é um processo stateful de longa
duração (`backend/src/server.ts`):

- **Singletons em memória:** `IoTConnectionManager.getInstance()`,
  `UserEventHub`, `NotificationStore`, o `MinuteBuffer` do
  `IoTDataProcessor` (leituras do minuto corrente, ainda não persistidas) e o
  cache do `AlertEvaluator`.
- **Três schedulers em `setInterval`:** `MinuteRollupScheduler` (persiste os
  baldes de minuto), `RetentionPurgeScheduler` (expurgo LGPD a cada 24h) e
  `TariffFlagSyncScheduler` (sincronização ANEEL, ADR-0007).
- **SSE** (`/api/iot/stream`): conexão HTTP mantida aberta indefinidamente.
- **Conexões MQTT/Modbus persistentes**, restauradas no boot
  (`restoreIoTConnections`).
- **Graceful shutdown com flush do buffer** — matar o processo abruptamente
  significa perder leituras que ainda não foram para o banco.
- **Módulos nativos:** `node-snap7` e `serialport` exigem toolchain de build
  (node-gyp) e binário por plataforma/arquitetura.

Disso decorre:

1. **Serverless é inviável** (Vercel Functions, AWS Lambda, Cloudflare
   Workers): não há singleton entre invocações, não há `setInterval`, e SSE
   de longa duração não sobrevive ao modelo.
2. **Scale-to-zero é destrutivo, não apenas lento.** Se o processo dorme, os
   schedulers param, o `MinuteBuffer` em memória se perde e as conexões IoT
   caem. Isso desqualifica o free tier do Render (dorme após 15 min de
   inatividade) e o Cloud Run com `min-instances=0` — não por latência de
   cold start, mas por perda de função.

### Levantamento de free tiers (verificado em 2026-08-06)

| Opção | Região Brasil? | Always-on? | Grátis? |
|---|---|---|---|
| Render free | Não (Oregon/Ohio/Frankfurt/Singapore) | **Não** — dorme em 15 min | Sim |
| Koyeb free | Não (Washington/Frankfurt) | Sim, mas 0,1 vCPU | Sim |
| Railway / Fly.io | Fly tem GRU (SP) | Sim | **Não** — usage-based (~US$ 3-5/mês) |
| Google Cloud Run | Sim (southamerica-east1) | Só com `min-instances≥1` (pago) | Parcial |
| **Oracle Cloud Always Free** | **Sim (sa-saopaulo-1 / sa-vinhedo-1)** | **Sim (VM)** | **Sim, permanente** |
| Neon (banco) | Sim (AWS sa-east-1) | Suspende após 5 min ociosa | Sim, 100 CU-h/mês |
| Supabase (banco) | Sim (São Paulo) | Pausa após ~1 semana ociosa | Sim |

**Conclusão do levantamento:** não existe PaaS gerenciado com free tier,
always-on e região Brasil ao mesmo tempo. O único caminho que satisfaz os
três é uma VM na Oracle Cloud Always Free.

## Decisão

**Todo o sistema roda numa única VM Oracle Cloud Always Free na região São
Paulo (`sa-saopaulo-1`, com `sa-vinhedo-1` como alternativa), sem nenhum
operador estrangeiro.**

Topologia:

```
┌──────────────────────────────────────────────────┐
│  Oracle Cloud Always Free — São Paulo            │
│                                                  │
│   Reverse proxy (TLS, host canônico)             │
│     ├── /      → frontend estático (Vite build)  │
│     └── /api   → backend Node (always-on)        │
│                    ├── SSE, 3 schedulers         │
│                    └── cliente MQTT → 127.0.0.1  │
│                                                  │
│   PostgreSQL (mesma VM, sem exposição externa)   │
│   iot-simulator + broker aedes (bind 127.0.0.1)  │
└──────────────────────────────────────────────────┘
```

Decisões que compõem esta:

1. **PostgreSQL na própria VM**, não gerenciado. Elimina o último operador
   externo possível: nenhum DPA a assinar, nenhuma transferência, e evita a
   armadilha do free tier do Neon (100 CU-horas/mês contra um backend
   always-on que segura pool de conexão — o mês tem ~730 horas).
2. **Frontend servido pela mesma VM**, não por CDN de borda. Um
   Vercel/Cloudflare Pages processaria o **IP do visitante** (dado pessoal)
   em servidores no exterior — pouco risco, mas seria um operador
   estrangeiro a documentar sem necessidade, já que a SPA é estática e o
   volume de uma demo de portfólio não precisa de CDN.
3. **Simulador IoT co-locado, com o broker MQTT (`aedes`) em `127.0.0.1`.**
   É o que mantém o "tempo real" da demo com dado vivo (painel, SSE, alertas
   disparando) sem expor um broker sem autenticação à internet — o
   endurecimento do perímetro do simulador é item da Fase 13 e ainda não
   existe. O `IOT_ALLOWED_HOSTS` da issue #150 passa a listar `localhost`,
   que é exatamente o caso legítimo que a allowlist foi desenhada para
   permitir.
4. **Cadastro público fechado — apenas contas de demonstração.** Ver
   "Condição de validade" abaixo; é o que sustenta juridicamente todo o
   resto.
5. **Nenhum provedor SMTP contratado.** Com o cadastro fechado e as contas
   demo em domínio inexistente (`@lumitrack.dev`), nenhum e-mail é entregue
   a pessoa real. As variáveis `SMTP_*` ficam com valores de sandbox.
   Consequência aceita: o fluxo "esqueci minha senha" **não é funcional na
   demo pública**.

### Consequência de conformidade

**Não há operador estrangeiro e, portanto, não há transferência
internacional de dados pessoais.** As SCCs da ANPD (Res. 19/2024) **não se
aplicam** — não por dispensa, mas por inexistência do fato gerador. Da mesma
forma, não há DPA a assinar (Art. 39), porque não há operador: o controlador
é o único agente de tratamento.

Isso resolve o achado de #158 pela via mais barata possível, que é
exatamente o que o roadmap recomendava: eliminar o problema em vez de
contratá-lo.

### Condição de validade (não é detalhe — é a premissa)

A conclusão acima depende de **o ambiente público não tratar dado pessoal de
titular real**. Isso só é verdade enquanto o cadastro público estiver
efetivamente fechado e o banco contiver apenas o seed sintético
(`backend/prisma/seed-demo/` — CPF/CNPJ matematicamente válidos porém nunca
emitidos, e-mails em domínio inexistente).

**O controle que fecha o cadastro ainda não está implementado.** Ele é item
da Fase 13 do roadmap ("credenciais demo fora do bundle + contas demo
read-only no servidor"). Enquanto não existir, esta ADR **não autoriza o
deploy público**: um cadastro aberto faria pessoas reais inserirem e-mail
real, e a premissa cairia — junto com toda a conclusão de conformidade.

Ver "Gates de go-live", abaixo.

## Alternativas consideradas

- **Render/Koyeb free tier (EUA/Europa)** — descartada por dois motivos
  independentes: (a) o Render dorme, o que não é uma degradação de
  performance mas uma quebra funcional (schedulers param, buffer se perde),
  e o Koyeb oferece 0,1 vCPU; (b) ambos criariam transferência
  internacional, trocando "zero papel" por "SCC + DPA + § 4 do aviso de
  privacidade reescrito com provedor estrangeiro". Pagar esse custo de
  conformidade para hospedar dado sintético é o pior dos dois mundos.
- **Fly.io na região GRU (~US$ 3-5/mês)** — tecnicamente a melhor opção:
  região Brasil, always-on, deploy por Dockerfile (que resolveria os módulos
  nativos com elegância) e ops quase zero. Descartada apenas pela restrição
  de custo zero do portfólio. **É a alternativa recomendada** caso a
  capacidade da Oracle inviabilize a opção escolhida, ou caso o custo de ops
  manual se mostre alto demais — a decisão de conformidade não muda (GRU é
  São Paulo).
- **Neon ou Supabase como banco gerenciado (ambos com região São Paulo)** —
  descartada porque introduziria um operador (com DPA a assinar) sem
  necessidade, já que a mesma VM comporta o Postgres. Continua sendo a
  alternativa natural se a operação crescer a ponto de o backup manual
  virar risco maior que o operador a mais.
- **Não hospedar (portfólio só com código e vídeo)** — descartada: o usuário
  quer uma demo funcional. Registrada porque é a opção de menor risco
  absoluto e continua válida se a Oracle não fornecer capacidade.

## Consequências

**Positivas**

- Zero custo recorrente, zero operador, zero transferência internacional —
  o cenário de conformidade mais simples possível.
- Always-on de verdade: os três schedulers, o SSE e as conexões MQTT
  funcionam como o código pressupõe, sem workaround.
- Controle total do ambiente de build, o que resolve os módulos nativos
  (`node-snap7`, `serialport`) sem depender do buildpack de um PaaS.
- O `ROPA.md` fica com a tabela de operadores **vazia por fato**, não por
  omissão — e o `privacy-policy.md` § 4 passa a poder afirmar
  "processamento exclusivamente no Brasil" com respaldo.

**Negativas e custos aceitos**

- **Ops manual:** a VM é responsabilidade do projeto — sistema operacional,
  Node, reverse proxy, TLS, `systemd`, firewall e, principalmente,
  **backup do PostgreSQL** (`pg_dump` agendado). Não há backup gerenciado.
- **Risco de capacidade:** há relatos consistentes de indisponibilidade de
  capacidade ARM (Ampere A1) em São Paulo para contas Always Free. Fallback
  documentado: 2 VMs x86 micro (1 GB RAM cada) — apertado para Postgres +
  Node + simulador, possivelmente exigindo separar o banco numa VM e a
  aplicação na outra. Se nem isso for possível, a alternativa é o Fly.io GRU.
- **Política de reclaim de instância ociosa:** contas Always Free podem ter
  instâncias recuperadas por inatividade. Uma demo de portfólio com pouco
  tráfego é justamente o perfil de risco.
- **Ponto único de falha:** tudo na mesma VM. Aceitável para portfólio,
  inaceitável para operação real.
- **"Esqueci minha senha" não funcional** na demo pública (sem SMTP).
- **Reavaliação obrigatória se um fork abrir cadastro real:** nesse momento
  volta a existir dado pessoal de titular, o SMTP passa a ser um operador
  (com DPA, e SCC se estiver fora do Brasil/UE), e o canal de privacidade
  placeholder da issue #155 precisa virar um endereço de fato monitorado.

## Gates de go-live

Antes de expor o ambiente publicamente, nesta ordem:

1. **Fechar o cadastro público** (contas demo read-only, Fase 13) — é a
   premissa desta ADR, não um refinamento.
2. Tirar as credenciais demo do bundle do frontend (Fase 13).
3. Endurecer o perímetro do simulador IoT — no mínimo o bind em `127.0.0.1`
   (Fase 13).
4. `IOT_ALLOWED_HOSTS=localhost` (ou `127.0.0.1/32`), para o backend alcançar
   o broker local sem afrouxar a proteção contra SSRF da issue #150.
5. TLS com host canônico e redirect de HTTP, mais CSP do SPA (Fase 13 — os
   dois itens estavam explicitamente "ligados à decisão de hospedagem", que
   é esta).
6. `pg_dump` agendado com retenção, e restauração testada ao menos uma vez.
7. Rotacionar todas as chaves de `.env` (`JWT_SECRET`, as quatro chaves de
   criptografia) para valores de produção — nunca os do `.env.example`.
