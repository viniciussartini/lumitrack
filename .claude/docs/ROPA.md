# ROPA — Registro das Operações de Tratamento de Dados Pessoais

> Produzido como remediação da issue #156 (épico #154, Fase 11 do
> `.claude/docs/roadmap.md`), a partir do achado ALTO do
> `.claude/docs/2026-08-05-conformidade-audit.md` (LGPD Art. 37). Forma
> simplificada — o regime de agente de pequeno porte (Res. CD/ANPD 2/2022)
> dispensa o encarregado, mas não o registro.
>
> **Não é parecer jurídico.** A coluna "Base legal" reflete o que
> `frontend/src/legal/privacy-policy.md` já declara hoje; a atribuição
> granular de base legal por operação, com revisão jurídica formal, é
> trabalho **deferido pela [ADR-0014](adr/0014-ambientes-permanentemente-demonstracao.md)**
> — só se justifica havendo titular real. Este documento registra o estado
> **real** do código na data abaixo — se o schema mudar, este arquivo
> precisa ser atualizado no mesmo PR (ver "Manutenção", ao final).
>
> **Data de referência:** 2026-08-23 · revisão pela ADR-0014, branch `epic/259-governanca-dados-ropa-ripd-dpa` (redação original: 2026-08-06, issue #156).

## ⚠️ Este repositório é permanentemente um ambiente de demonstração

Ver **[ADR-0014](adr/0014-ambientes-permanentemente-demonstracao.md)**: os
dois ambientes publicados do LumiTrack (produção VPS + staging Render/Neon)
**nunca vão tratar dado real de titular** — não é um estado transitório
"enquanto o cadastro estiver fechado", é uma decisão permanente. Como em
`.claude/docs/PROCEDIMENTO_DIREITOS_TITULAR.md`: não há operação real, e os
dados de demonstração (`backend/prisma/seed-demo/`) são **100% sintéticos**
— CPF/CNPJ gerados matematicamente válidos mas nunca emitidos de verdade
(ver `backend/prisma/seed-demo/identities.ts`), e-mails em domínio `.dev`
inexistente.

**A tabela de operadores abaixo não está vazia** — ao contrário do que uma
versão anterior deste documento chegou a afirmar, e que o laudo de
conformidade de 2026-08-22 apontou como autocontradição (a tabela lista
Render/Neon nos EUA enquanto o texto dizia "sem operador"). Há 3 operadores
reais (VPS, Render, Neon, ver tabela abaixo); nenhum tem DPA assinado, e o
staging tem transferência internacional sem SCC. A ADR-0014 assume esse
risco de forma explícita e permanente, em vez de tratá-lo como pendência a
sanar — quem fizer fork deste repositório para operar com titular real
herda a obrigação de resolver isso, este documento não a resolve por ele.

## Operações de tratamento

Uma linha por operação identificável no schema (`backend/prisma/schema.prisma`).

### 1. Cadastro, autenticação e sessão

| Campo | Conteúdo |
|---|---|
| Tabelas | `users`, `auth_tokens`, `refresh_tokens` |
| Finalidade | Criar e gerenciar a conta; autenticar (login/logout) e manter sessão segura, com revogação a qualquer momento. |
| Titulares | Usuários da plataforma (pessoa física e jurídica). |
| Categorias de dados | Identificação (nome/sobrenome ou razão social/nome fantasia, e-mail); documento (CPF/CNPJ — cifrado AES-256-GCM com IV aleatório, `shared/crypto/encryption.ts`; blind index HMAC-SHA256 determinístico para busca/unicidade sem descriptografar, `shared/crypto/blindIndex.ts`); senha (hash bcrypt, nunca retornada pela API); papel (`role`, USER/ADMIN); consentimento (`consentedAt`/`consentVersion`); tokens de sessão (`auth_tokens` valor opaco, `refresh_tokens` hash SHA-256 — nunca o valor puro). |
| Base legal (Art. 7º) | Consentimento (I, aceite de Política/Termos) + execução de contrato (V, prestação do serviço). |
| Retenção | Conta ativa: indefinida, enquanto o titular não a excluir. `auth_tokens`/`refresh_tokens` expirados ou revogados: purgados após `DATA_RETENTION_AUTH_TOKEN_DAYS`/`DATA_RETENTION_REFRESH_TOKEN_DAYS` (default 30 dias, `RetentionService`). Exclusão da conta: `User` removido com `onDelete: Cascade` em `Property`/`AuthToken`/`RefreshToken`/`PasswordReset`/`Alert`/`MfaBackupCode`. |
| Operadores | **Produção (VPS):** nenhum — autenticação 100% interna, banco na mesma máquina do controlador (ADR-0008). **Staging (Render/Neon, EUA):** os dois — a tabela `users` vive fisicamente no Neon enquanto o staging existir (ver Tabela de operadores). Sem titular real hoje (cadastro fechado, contas sintéticas), mas a infraestrutura já é operador, independentemente do conteúdo atual. |
| Transferência internacional | **Produção:** nenhuma (ADR-0008/0012). **Staging:** o dado desta operação reside em infraestrutura americana enquanto o staging existir — sem titular real por trás hoje; risco aceito permanentemente pela ADR-0014 caso isso mude (não planejado). |
| Medidas de segurança | bcrypt (senha); AES-256-GCM + blind index (CPF/CNPJ); hash SHA-256 (refresh token); revogação em cascata de sessões no reset de senha (#152); rate limiting em login; MFA opcional (item 7). |

### 2. Gestão de propriedades e endereço

| Campo | Conteúdo |
|---|---|
| Tabelas | `properties` (`areas`/`devices` não têm campo de PII estruturado — só nome/descrição livres definidos pelo usuário). |
| Finalidade | Vincular o consumo de energia ao imóvel monitorado; base para cálculo de tarifa (classe de faturamento, distribuidora). |
| Titulares | Usuários donos da propriedade. |
| Categorias de dados | Endereço, cidade, estado, CEP (campos opcionais — cifrados em repouso, ver "Medidas de segurança"). |
| Base legal (Art. 7º) | Execução de contrato (V). |
| Retenção | Enquanto a conta/propriedade existir; removida em cascata (`onDelete: Cascade`) na exclusão do usuário. Sem prazo de purga independente — não é uma das 4 entidades cobertas pelo `RetentionService`. |
| Operadores | **Produção:** nenhum. **Staging:** Render + Neon (ver item 1 e Tabela de operadores) — mesma lógica de infraestrutura, não de conteúdo (sem titular real hoje). |
| Transferência internacional | **Produção:** nenhuma. **Staging:** ver item 1 — risco aceito permanentemente pela ADR-0014. |
| Medidas de segurança | Controle de acesso por posse (ownership) em toda rota. `address`/`city`/`state`/`zipCode` cifrados em repouso com AES-256-GCM e chave própria (`ADDRESS_ENCRYPTION_KEY`, `shared/crypto/addressEncryption.ts`) — segregada da chave de CPF/CNPJ, mesmo padrão de compartimentalização de risco. Sem blind index (endereço não tem constraint de unicidade nem é usado como filtro de busca — adicionar um seria complexidade sem benefício). |

### 3. Medição e consumo

| Campo | Conteúdo |
|---|---|
| Tabelas | `meters`, `meter_readings` |
| Finalidade | Monitorar consumo de energia em tempo real e histórico; base de relatórios, simulações e alertas. |
| Titulares | Usuários (via cadeia `meter` → alvo → `property` → `user`). |
| Categorias de dados | Leituras por minuto (kWh, tensão, corrente, potência ativa, fator de potência); configuração técnica de conectividade do medidor (protocolo, host, porta, tópico, endereço; `extra` pode incluir credencial do dispositivo). |
| Base legal (Art. 7º) | Execução de contrato (V) — é o núcleo do serviço. |
| Retenção | **Sem prazo definido hoje.** `meter_readings` cresce indefinidamente; não é uma das 4 entidades cobertas pelo `RetentionService`. Achado registrado no roadmap como o maior gap de retenção do produto — reclassificado para a **Fase 15** (armazenamento/performance, não mais conformidade, pela ADR-0014). |
| Operadores | **Produção:** nenhum externo direto — o dado fica no próprio banco na VPS; a rede IoT do titular não é operador de dados pessoais do LumiTrack. **Staging:** Render + Neon (ver item 1). |
| Transferência internacional | **Produção:** nenhuma. **Staging:** ver item 1 — risco aceito permanentemente pela ADR-0014. |
| Medidas de segurança | Acesso por posse. **A granularidade por minuto é, em si, o risco central identificado pela issue #157 (RIPD)** — a cadeia `MeterReading → Meter → Device/Area/Property → User` liga uma leitura por minuto a um CPF e a um endereço, permitindo inferir presença/rotina. **Gap identificado, não corrigido nesta issue:** `Meter.extra` pode conter a senha do dispositivo em texto claro no JSON (já listado na Fase 13 do roadmap como pendência de cifragem). |

### 4. Alertas por faixa de potência

| Campo | Conteúdo |
|---|---|
| Tabelas | `alerts`, `alert_trigger_events` |
| Finalidade | Notificar o usuário sobre consumo fora da faixa esperada. |
| Titulares | Usuários. |
| Categorias de dados | Configuração do alerta (nome, faixa de potência de referência); histórico de disparo (estatísticas agregadas de potência do episódio — nenhum dado pessoal além da vinculação ao usuário via `alert.userId`). |
| Base legal (Art. 7º) | Execução de contrato (V). |
| Retenção | **Sem prazo definido hoje** — `alert_trigger_events` não é purgado pelo `RetentionService` (mesma lacuna do item 3, mesma reclassificação para a Fase 15). |
| Operadores | **Produção:** nenhum. **Staging:** Render + Neon (ver item 1). |
| Transferência internacional | **Produção:** nenhuma. **Staging:** ver item 1 — risco aceito permanentemente pela ADR-0014. |
| Medidas de segurança | Acesso por posse; eventos entregues via SSE só ao dono do recurso. |

### 5. Trilha de auditoria

| Campo | Conteúdo |
|---|---|
| Tabela | `audit_logs` |
| Finalidade | Registrar eventos de segurança (login, logout, acesso negado, CRUD de dados pessoais, habilitar/desabilitar MFA, export) para investigação de incidente (Art. 48) e responsabilização (Art. 6º, X). |
| Titulares | Usuários; tentativas de login não autenticadas (correlacionadas por blind index do e-mail tentado, issue #149 — nunca o e-mail em claro). |
| Categorias de dados | Ação, resultado, tipo/id do recurso afetado, IP, user-agent, `metadata` (só nomes de campo alterados, nunca os valores — issue #149). `userId` nullable com `onDelete: SetNull`: o registro sobrevive à exclusão da conta, de propósito. |
| Base legal (Art. 7º) | Cumprimento de obrigação legal / legítimo interesse em segurança (II/IX) — o Marco Civil da Internet (Lei 12.965/2014, Art. 15) também exige guarda de registro de acesso por, no mínimo, 6 meses. |
| Retenção | 730 dias (~2 anos) via `DATA_RETENTION_AUDIT_LOG_DAYS` (`RetentionService`) — acima do mínimo de 6 meses do Marco Civil. |
| Operadores | **Produção (VPS):** nenhum — log de auditoria fica no próprio PostgreSQL, na mesma máquina. **Staging (Render/Neon, EUA): os dois, e não é hipotético.** `POST /api/auth/demo-login` bem-sucedido grava `audit_logs` com `ipAddress`/`userAgent` reais do visitante (`shared/audit/requestContext.ts` → `req.ip`, com `trust proxy` ativo) — persistido no Neon por 730 dias. **Este é o ponto verificado onde dado pessoal de pessoa real (não sintético) atravessa a fronteira**, achado do laudo de conformidade de 2026-08-22. Se um agregador de log ou APM externo for adotado (Sentry, Datadog, etc. — ver `07-decisoes-em-aberto.md`), ele se torna operador novo e **deve ser adicionado à tabela de operadores abaixo antes do go-live**. |
| Transferência internacional | **Produção:** nenhuma. **Staging: sim, e com dado pessoal real, não sintético** — o IP de qualquer visitante que usa o login de demonstração é gravado no Neon (EUA) por 730 dias, sem SCC. Risco assumido permanentemente pela ADR-0014 (não é o mesmo caso dos itens 1-4/6-7, onde a exposição depende de haver titular cadastrado — aqui já existe hoje, de visitante). |
| Medidas de segurança | Redação de PII no log estruturado de aplicação (`pino` `redact`, issue #149) — o log de auditoria em si vive só na tabela `audit_logs`, nunca espelhado por inteiro no log de aplicação. |

### 6. Recuperação de senha

| Campo | Conteúdo |
|---|---|
| Tabela | `password_resets` + operador SMTP |
| Finalidade | Permitir que o titular redefina a senha esquecida. |
| Titulares | Usuários. |
| Categorias de dados | E-mail (enviado ao operador SMTP); token de reset (hash SHA-256 em repouso, issue #151 — o valor puro só trafega no corpo do e-mail, nunca persistido em claro). |
| Base legal (Art. 7º) | Execução de contrato (V). |
| Retenção | `password_resets` usado ou expirado: purgado após `DATA_RETENTION_PASSWORD_RESET_DAYS` (default 30 dias, `RetentionService`). O e-mail em si fica sob a política de retenção do provedor SMTP (ver "Requisito de retenção mínima de logs" na tabela de operadores). |
| Operadores | **SMTP** — ver tabela de operadores abaixo. Único operador já **codificado** no projeto (`backend/src/modules/auth/email.service.ts`), mas sem provedor de produção selecionado (`backend/.env.example` usa `smtp.example.com`/`changeme` como placeholder). |
| Transferência internacional | Nenhuma — **nenhum provedor SMTP está contratado** (ADR-0008): com o cadastro público fechado e as contas de demonstração em domínio inexistente, nenhum e-mail é entregue a pessoa real. Contratar um provedor reabriria esta linha (DPA + SCC se fora do Brasil/UE) — não planejado (ADR-0014). |
| Medidas de segurança | Token hasheado (SHA-256) em repouso; todas as sessões e refresh tokens do usuário são revogados no momento do reset (issue #152, mitiga tomada de conta). TLS obrigatório no SMTP fica deferido pela ADR-0014 (issue #273 fechada por prematuridade — nenhum provedor contratado hoje) até que um provedor seja de fato adotado. |

### 7. MFA (autenticação multifator)

| Campo | Conteúdo |
|---|---|
| Tabelas | `mfa_backup_codes`, `users.mfaSecret` |
| Finalidade | Segundo fator de autenticação, opcional (opt-in do titular). |
| Titulares | Usuários que habilitam o MFA. |
| Categorias de dados | Segredo TOTP (cifrado AES-256-GCM, chave própria — `shared/crypto/mfaEncryption.ts`, nunca em texto claro); códigos de backup (hash bcrypt, uso único). |
| Base legal (Art. 7º) | Consentimento (I) — é uma funcionalidade opt-in. |
| Retenção | Apagado ao desabilitar o MFA (`deleteMany` transacional) ou ao excluir a conta (cascade). Não se aplica prazo por tempo — o dado só existe enquanto o fator estiver ativo. |
| Operadores | **Produção:** nenhum. **Staging:** Render + Neon (ver item 1). |
| Transferência internacional | **Produção:** nenhuma. **Staging:** ver item 1 — risco aceito permanentemente pela ADR-0014. |
| Medidas de segurança | Step-up (senha + código do fator vigente) exigido tanto para desabilitar quanto para reinscrever o MFA (issue #153); purga do lote de backup codes anterior a cada nova inscrição (issue #153); segredo nunca retornado pela API após o setup inicial. |

### Tabelas sem dado pessoal (fora do escopo deste ROPA)

Verificadas e conscientemente excluídas — não guardam dado pessoal nem
vinculação a um titular específico: `energy_distributors` (catálogo público,
somente leitura), `tariff_flag_config`/`tariff_flag_history` (configuração
tarifária global; `changedByUserId` em `tariff_flag_history` identifica um
administrador agindo, não um titular sendo tratado — mesma natureza de um
log de admin, não repetido aqui para não duplicar o item 5).

## Tabela de operadores (Art. 39)

> **Desde a Fase 13.7 (ADR-0012) o LumiTrack roda em dois ambientes, não um**,
> e a tabela abaixo cobre os dois. A diferença entre eles **não é ter ou não
> ter operador** — é *quantos*, *onde processam* e *a que têm acesso*:
>
> - **Produção** (VPS, São Paulo): um único operador, o **provedor de
>   infraestrutura**, que processa integralmente no Brasil. Aplicação, banco
>   e simulador rodam na mesma máquina alugada, sob controle direto do
>   controlador; o provedor não tem acesso ao conteúdo da aplicação no curso
>   normal da operação, mas **armazenar dado por conta do controlador é
>   tratamento** (Art. 5º, X) e quem o faz é operador (Art. 5º, VII) — o
>   papel existe independentemente do nível de acesso. É o mesmo agente
>   externo que a ADR-0012 reconhece na sua análise de conformidade.
> - **Staging/validação** (Render + Neon, EUA): dois operadores, ambos fora
>   do país, com a exposição residual registrada na ADR-0010.
>
> **Pela ADR-0014 (2026-08-23): nenhum dos três operadores abaixo terá DPA
> assinado, e o staging não terá SCC celebrada, enquanto os dois ambientes
> permanecerem demonstração.** Não é mais o caso de "gate que reabre quando
> abrir cadastro real" — é risco assumido de forma explícita e permanente.
> A tabela não vai ficar vazia por migração de hospedagem (aconteceu na
> Fase 13.7 e a produção ganhou seu próprio operador nacional), nem por
> regularização contratual futura — só se um fork decidir operar com
> titular real e assumir esse trabalho por conta própria.

| Operador | Serviço | Ambiente | Dado tratado | País de processamento | DPA assinado | SCC (se fora BR/UE) | Data |
|---|---|---|---|---|---|---|---|
| Provedor de infraestrutura (VPS) | Servidor dedicado que hospeda toda a produção (aplicação, banco e simulador na mesma máquina) | **Produção** | Todo o dado da aplicação, em repouso no disco da máquina alugada — sem acesso lógico do provedor no curso normal da operação | **Brasil (São Paulo)** | Não | n/a — processamento nacional | 2026-08-23 |
| Render | Hospedagem da aplicação (API + interface estática) | Staging/validação | Registros de acesso (IP, data/hora, rota) | Estados Unidos | Não | **Não** | 2026-08-09 |
| Neon | PostgreSQL gerenciado | Staging/validação | Dados sintéticos das contas de demonstração **+ registro de acesso real de visitante** — `audit_logs.ipAddress`/`userAgent` de todo `POST /api/auth/demo-login` (ver item 5), reais e não sintéticos, retidos 730 dias | Estados Unidos | Não | **Não** | 2026-08-09 |

**A tabela deixou de estar vazia em 2026-08-09** (**ADR-0010**), quando o
ambiente publicado passou a rodar em free tier fora do Brasil. A **produção**
(Fase 13.7, 2026-08-23) restaurou a conclusão de conformidade da ADR-0008 no
que ela tem de decisivo — **nenhum dado sai do país** —, mas não a versão
absoluta de "zero operador": trocar um provedor estrangeiro por um nacional
elimina a transferência internacional, não o papel de operador. A diferença
importa numa fiscalização, e é a razão desta linha existir.

**Sobre o DPA da produção:** não celebrado, e não será celebrado enquanto a
ADR-0014 vigorar. Diferente do caso Render/Neon, aqui não há transferência
internacional a cobrir por SCC — a lacuna é apenas a formalização do Art. 39
com o provedor, cujo contrato padrão de hospedagem já rege a relação. Risco
assumido de forma permanente pela ADR-0014, listado no `09-conformidade-legal.md`.

**O que isso significa, sem eufemismo, sobre o staging:**

- **Não há DPA nem SCC celebrados** com Render e Neon. Isso é uma lacuna
  real, registrada como tal.
- **A conta de usuário não contém dado pessoal de titular real:** o cadastro
  público está fechado (`REGISTRATION_ENABLED=false`) em **ambos** os
  ambientes, e as duas contas existentes são sintéticas
  (`backend/prisma/seed-demo/` — CPF/CNPJ nunca emitidos, e-mails em domínio
  inexistente). Sem titular cadastrado, não há dado pessoal de conta.
- **Mas o Neon trata mais do que dado fictício.** `audit_logs` — que reside
  fisicamente no Neon — grava `ipAddress`/`userAgent` **reais** de qualquer
  visitante que usa `POST /api/auth/demo-login` (item 5), retidos por 730
  dias. Essa é a exposição real, tratada nos EUA, sem SCC: não é só "os
  registros de acesso processados pelo Render" (que também existe, do lado
  do provedor de hospedagem) — é dado pessoal de visitante **persistido no
  banco de dados**, não só de passagem. É o risco assumido da ADR-0010,
  mantido conscientemente pela ADR-0012 e tornado **permanente** pela
  ADR-0014 — não é mais custo transitório de um ambiente de validação, é
  uma condição aceita para o staging existir.

**Única forma de esvaziar esta tabela por completo:** descontinuar o
staging (Render+Neon) e passar a validar mudanças por outro meio, sem
infraestrutura estrangeira — não está planejado. Enquanto o staging existir
com esse papel, esta tabela continua tendo as duas linhas de staging
(Render + Neon), mesmo que a linha de produção (VPS) já esteja limpa de
transferência internacional. Isso não é um "gate" que algo dispara — é uma
escolha de infraestrutura, independente da decisão da ADR-0014.

**Gate obrigatório ao adotar qualquer operador novo** (SMTP, APM, agregador
de log, banco gerenciado, CDN): DPA assinado **antes do primeiro byte de
dado pessoal** e, se o processamento ocorrer fora do Brasil ou da UE, SCCs
da ANPD incorporadas ao contrato. Os requisitos técnicos mínimos a exigir
contratualmente já estão detalhados em
`.claude/docs/AUDITORIA_SEGURANCA.md` § 7.1 (TLS obrigatório, retenção
mínima de logs, localização de processamento, notificação de incidente em
até 72h, cláusula de revogação, documentação de subcontratados,
certificação de segurança) — usar aquela seção como anexo técnico do
contrato. Após a assinatura, arquivar a cópia fora do repositório git e
acrescentar a linha nesta tabela.

**Se um provedor SMTP vier a ser contratado** (não planejado — ver ADR-0014):
DPA assinado e, se o processamento ocorrer fora do Brasil ou da UE, SCCs da
ANPD incorporadas ao contrato — **antes do primeiro byte de dado pessoal
trafegar**. Os requisitos
técnicos mínimos a exigir contratualmente do operador SMTP já estão
detalhados em `.claude/docs/AUDITORIA_SEGURANCA.md` § 7.1 (TLS obrigatório,
retenção mínima de logs, localização de processamento, notificação de
incidente em até 72h, cláusula de revogação, documentação de
subcontratados, certificação de segurança) — usar aquela seção como anexo
técnico do contrato quando um provedor for escolhido. Após a assinatura,
arquivar a cópia fora do repositório git e atualizar a linha correspondente
nesta tabela (nunca deixar o "S/N" desatualizado).

## Decisões já tomadas que constam neste registro

- **Dados de demonstração são sintéticos.** `backend/prisma/seed-demo/`
  gera CPF/CNPJ matematicamente válidos mas nunca emitidos
  (`identities.ts`) e e-mails em domínio `.dev` inexistente — não há
  titular real por trás de nenhum registro de demonstração.
- **`attemptedEmail` em log de falha de login vira blind index** (issue
  #149): o e-mail tentado (que pode não pertencer a um titular cadastrado)
  nunca é logado em claro — só o HMAC determinístico, que permite
  correlacionar tentativas repetidas sem reter o dado em si.

## Transferência internacional e hospedagem — estado atual

**Revisada em 2026-08-23 (ADR-0012, e novamente pela ADR-0014): dois
ambientes, duas conclusões diferentes — e a segunda agora é permanente.**

A decisão original (ADR-0008, issue #158) hospedava tudo em São Paulo e
podia afirmar que não havia transferência internacional por inexistência do
fato gerador. A demo pública foi para free tier fora do Brasil em
2026-08-09 (ADR-0010, Render + Neon), e a afirmação deixou de ser
verdadeira **para o ambiente publicado então**. A Fase 13.7 (ADR-0012,
2026-08-23) não desfez isso — em vez disso, separou os dois papéis em
ambientes distintos: a **produção** (VPS Hostinger, São Paulo,
`lumitrack.app.br`) retoma a conclusão da ADR-0008 na íntegra; o
**staging/validação** (Render + Neon, mesma infraestrutura de antes)
continua com a exposição da ADR-0010, agora permanentemente, não como
estado transitório.

### Produção (VPS Hostinger, São Paulo)

Não há transferência internacional. Aplicação, banco de dados e simulador
rodam na mesma máquina, sob controle direto do controlador, em São Paulo.
As SCCs da ANPD (Res. CD/ANPD 19/2024) não se aplicam por inexistência do
fato gerador — nenhum dado sai do país.

Há **um** operador (Art. 39): o provedor de infraestrutura que aluga a
máquina, listado na tabela acima. Ele processa integralmente em território
nacional e não acessa o conteúdo da aplicação no curso normal da operação,
mas armazenamento é tratamento (Art. 5º, X) e o papel de operador existe
independentemente do nível de acesso. **DPA não celebrado** — risco assumido
permanentemente pela ADR-0014, sem exposição internacional associada.

### Staging/validação (Render + Neon)

O que efetivamente atravessa a fronteira:

- **Registros de acesso de visitantes** (IP, data/hora, rota) — dado
  pessoal de pessoa real, tratado pelo Render nos Estados Unidos. **Sem
  SCC celebrada.** É a exposição real, e é o risco assumido pela ADR-0010,
  mantido conscientemente pela ADR-0012 e declarado **permanente** pela
  ADR-0014.
- **Dados das contas de demonstração** — sintéticos, sem titular. Não são
  dado pessoal e, portanto, sua ida ao exterior não configura transferência
  internacional de dado pessoal.

Não há provedor SMTP contratado em nenhum dos dois ambientes, então nenhum
e-mail é entregue a pessoa real.

**Condição que sustenta este quadro, nos dois ambientes:** o cadastro
público está fechado por padrão (`REGISTRATION_ENABLED=false`, inclusive
como default do código desde a ADR-0014) — controle implementado desde a
Fase 13 do roadmap, confirmado em produção e staging. **Pela ADR-0014, essa
condição é permanente, não transitória:** os dois ambientes nunca vão
tratar dado real de titular. Se o próprio projeto decidir um dia abrir
cadastro real em qualquer um dos dois — cenário não planejado —, isso exige
uma nova `auditoria-conformidade` completa e a resolução de todos os
achados **antes** de `REGISTRATION_ENABLED=true`, não a retomada informal
do que ficou registrado aqui (ADR-0014, ponto 5). Quem fizer **fork** deste
repositório para operar com titular real herda essa análise integralmente a
partir do momento do fork.

Qualquer provedor estrangeiro adotado depois (APM, agregador de log, SMTP,
CDN, banco gerenciado) **reabre** esta seção para o ambiente em que for
adotado, e exige DPA + SCC antes do primeiro byte de dado pessoal — essa
regra vale independentemente da ADR-0014, que trata dos 3 operadores já
existentes, não de operadores futuros.

## Manutenção deste documento

Este ROPA precisa refletir o schema real, não uma intenção. Regra
acrescentada à skill `nova-feature`
(`.claude/skills/nova-feature/SKILL.md`, Definition of Done): **toda feature
que introduz uma tabela nova com dado pessoal, ou muda finalidade/retenção/
operador de uma operação já registrada aqui, atualiza este arquivo no mesmo
PR.** Um ROPA desatualizado é pior do que a ausência dele — cria falsa
confiança numa eventual fiscalização.
