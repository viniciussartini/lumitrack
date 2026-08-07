# ROPA — Registro das Operações de Tratamento de Dados Pessoais

> Produzido como remediação da issue #156 (épico #154, Fase 11 do
> `.claude/docs/roadmap.md`), a partir do achado ALTO do
> `.claude/docs/2026-08-05-conformidade-audit.md` (LGPD Art. 37). Forma
> simplificada — o regime de agente de pequeno porte (Res. CD/ANPD 2/2022)
> dispensa o encarregado, mas não o registro.
>
> **Não é parecer jurídico.** A coluna "Base legal" reflete o que
> `frontend/src/legal/privacy-policy.md` já declara hoje; a atribuição
> granular de base legal por operação, com revisão jurídica, é trabalho da
> Fase 14 (`roadmap.md`). Este documento registra o estado **real** do
> código na data abaixo — se o schema mudar, este arquivo precisa ser
> atualizado no mesmo PR (ver "Manutenção", ao final).
>
> **Data de referência:** 2026-08-06 · commit da branch `feat/154-bloqueadores-conformidade-lgpd`.

## ⚠️ Este repositório é um projeto de portfólio

Como em `.claude/docs/PROCEDIMENTO_DIREITOS_TITULAR.md`: não há operação
real, e os dados de demonstração (`backend/prisma/seed-demo/`) são **100%
sintéticos** — CPF/CNPJ gerados matematicamente válidos mas nunca emitidos
de verdade (ver `backend/prisma/seed-demo/identities.ts`), e-mails em
domínio `.dev` inexistente.

A tabela de operadores abaixo está **vazia por fato**: a ADR-0008 decidiu
hospedagem própria em São Paulo, com banco na mesma máquina e sem provedor
SMTP contratado — não há terceiro tratando dado por conta do LumiTrack.

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
| Operadores | Nenhum — autenticação é 100% interna e o banco roda na própria VM do controlador (ADR-0008). |
| Transferência internacional | Nenhuma — todo o tratamento ocorre em São Paulo, Brasil (ADR-0008). |
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
| Operadores | Nenhum. |
| Transferência internacional | Nenhuma — processamento exclusivamente no Brasil (ADR-0008). |
| Medidas de segurança | Controle de acesso por posse (ownership) em toda rota. `address`/`city`/`state`/`zipCode` cifrados em repouso com AES-256-GCM e chave própria (`ADDRESS_ENCRYPTION_KEY`, `shared/crypto/addressEncryption.ts`) — segregada da chave de CPF/CNPJ, mesmo padrão de compartimentalização de risco. Sem blind index (endereço não tem constraint de unicidade nem é usado como filtro de busca — adicionar um seria complexidade sem benefício). |

### 3. Medição e consumo

| Campo | Conteúdo |
|---|---|
| Tabelas | `meters`, `meter_readings` |
| Finalidade | Monitorar consumo de energia em tempo real e histórico; base de relatórios, simulações e alertas. |
| Titulares | Usuários (via cadeia `meter` → alvo → `property` → `user`). |
| Categorias de dados | Leituras por minuto (kWh, tensão, corrente, potência ativa, fator de potência); configuração técnica de conectividade do medidor (protocolo, host, porta, tópico, endereço; `extra` pode incluir credencial do dispositivo). |
| Base legal (Art. 7º) | Execução de contrato (V) — é o núcleo do serviço. |
| Retenção | **Sem prazo definido hoje.** `meter_readings` cresce indefinidamente; não é uma das 4 entidades cobertas pelo `RetentionService`. Achado já registrado no roadmap (Fase 14) como o maior gap de retenção do produto. |
| Operadores | Nenhum externo direto — o dado fica no próprio banco; a rede IoT do titular não é operador de dados pessoais do LumiTrack. |
| Transferência internacional | Nenhuma — processamento exclusivamente no Brasil (ADR-0008). |
| Medidas de segurança | Acesso por posse. **A granularidade por minuto é, em si, o risco central identificado pela issue #157 (RIPD)** — a cadeia `MeterReading → Meter → Device/Area/Property → User` liga uma leitura por minuto a um CPF e a um endereço, permitindo inferir presença/rotina. **Gap identificado, não corrigido nesta issue:** `Meter.extra` pode conter a senha do dispositivo em texto claro no JSON (já listado na Fase 13 do roadmap como pendência de cifragem). |

### 4. Alertas por faixa de potência

| Campo | Conteúdo |
|---|---|
| Tabelas | `alerts`, `alert_trigger_events` |
| Finalidade | Notificar o usuário sobre consumo fora da faixa esperada. |
| Titulares | Usuários. |
| Categorias de dados | Configuração do alerta (nome, faixa de potência de referência); histórico de disparo (estatísticas agregadas de potência do episódio — nenhum dado pessoal além da vinculação ao usuário via `alert.userId`). |
| Base legal (Art. 7º) | Execução de contrato (V). |
| Retenção | **Sem prazo definido hoje** — `alert_trigger_events` não é purgado pelo `RetentionService` (mesma lacuna do item 3). |
| Operadores | Nenhum. |
| Transferência internacional | Nenhuma — processamento exclusivamente no Brasil (ADR-0008). |
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
| Operadores | Nenhum externo hoje (log de auditoria fica no próprio PostgreSQL). Se um agregador de log ou APM externo for adotado (Sentry, Datadog, etc. — ver `07-decisoes-em-aberto.md`), ele se torna operador novo e **deve ser adicionado à tabela de operadores abaixo antes do go-live**. |
| Transferência internacional | Nenhuma — processamento exclusivamente no Brasil (ADR-0008). |
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
| Transferência internacional | Nenhuma — **nenhum provedor SMTP está contratado** (ADR-0008): com o cadastro público fechado e as contas de demonstração em domínio inexistente, nenhum e-mail é entregue a pessoa real. Contratar um provedor reabre esta linha (DPA + SCC se fora do Brasil/UE). |
| Medidas de segurança | Token hasheado (SHA-256) em repouso; todas as sessões e refresh tokens do usuário são revogados no momento do reset (issue #152, mitiga tomada de conta). TLS obrigatório no SMTP de produção é pendência registrada na Fase 14 do roadmap. |

### 7. MFA (autenticação multifator)

| Campo | Conteúdo |
|---|---|
| Tabelas | `mfa_backup_codes`, `users.mfaSecret` |
| Finalidade | Segundo fator de autenticação, opcional (opt-in do titular). |
| Titulares | Usuários que habilitam o MFA. |
| Categorias de dados | Segredo TOTP (cifrado AES-256-GCM, chave própria — `shared/crypto/mfaEncryption.ts`, nunca em texto claro); códigos de backup (hash bcrypt, uso único). |
| Base legal (Art. 7º) | Consentimento (I) — é uma funcionalidade opt-in. |
| Retenção | Apagado ao desabilitar o MFA (`deleteMany` transacional) ou ao excluir a conta (cascade). Não se aplica prazo por tempo — o dado só existe enquanto o fator estiver ativo. |
| Operadores | Nenhum. |
| Transferência internacional | Nenhuma — processamento exclusivamente no Brasil (ADR-0008). |
| Medidas de segurança | Step-up (senha + código do fator vigente) exigido tanto para desabilitar quanto para reinscrever o MFA (issue #153); purga do lote de backup codes anterior a cada nova inscrição (issue #153); segredo nunca retornado pela API após o setup inicial. |

### Tabelas sem dado pessoal (fora do escopo deste ROPA)

Verificadas e conscientemente excluídas — não guardam dado pessoal nem
vinculação a um titular específico: `energy_distributors` (catálogo público,
somente leitura), `tariff_flag_config`/`tariff_flag_history` (configuração
tarifária global; `changedByUserId` em `tariff_flag_history` identifica um
administrador agindo, não um titular sendo tratado — mesma natureza de um
log de admin, não repetido aqui para não duplicar o item 5).

## Tabela de operadores (Art. 39)

| Operador | Serviço | Dado tratado | País de processamento | DPA assinado | SCC (se fora BR/UE) | Data |
|---|---|---|---|---|---|---|
| *(nenhum)* | — | — | — | — | — | — |

**A tabela está vazia por fato, não por omissão.** A decisão de hospedagem
(**ADR-0008**, issue #158) escolheu uma VM própria na Oracle Cloud Always
Free em **São Paulo**, com o **PostgreSQL na mesma máquina**, o **frontend
estático servido pelo mesmo host** (sem CDN de borda) e **nenhum provedor
SMTP contratado**. O controlador é, portanto, o único agente de tratamento —
não há operador a quem contratar via DPA (Art. 39).

A Oracle Cloud é fornecedora de **infraestrutura sob controle direto do
controlador** (IaaS, região brasileira), não uma operadora que trate dados
por conta do LumiTrack — mesmo assim, a região Brasil elimina a discussão de
transferência internacional na raiz.

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

**Gate obrigatório de go-live, por provedor:** DPA assinado e, se o
processamento ocorrer fora do Brasil ou da UE, SCCs da ANPD incorporadas ao
contrato — **antes do primeiro byte de dado pessoal trafegar**. Os requisitos
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

**Decidida (ADR-0008, issue #158): não há transferência internacional de
dados pessoais**, e a afirmação continua verdadeira depois do deploy — que
é justamente o ponto da decisão.

Topologia: uma única VM na **Oracle Cloud Always Free, região São Paulo**
(`sa-saopaulo-1`), hospedando a aplicação, o **PostgreSQL na mesma máquina**
e o frontend estático servido pelo mesmo host (sem CDN de borda, que
processaria o IP do visitante no exterior). Nenhum provedor SMTP contratado.

Consequência jurídica: as SCCs da ANPD (Res. CD/ANPD 19/2024) **não se
aplicam** — não por dispensa, mas por inexistência do fato gerador. Não há
operador (Art. 39), logo não há DPA a assinar: o controlador é o único
agente de tratamento.

**Condição de validade.** A ADR-0008 é explícita: a conclusão acima depende
de o ambiente público **não tratar dado pessoal de titular real**, o que
exige o cadastro público fechado (apenas contas de demonstração sobre o seed
sintético). Esse controle **ainda não está implementado** — é item da Fase
13 do roadmap. Enquanto não existir, o ambiente não deve ser publicado; um
cadastro aberto faria pessoas reais inserirem e-mail real e derrubaria a
premissa, junto com toda a conclusão desta seção.

Qualquer provedor estrangeiro adotado depois (APM, agregador de log, SMTP,
CDN, banco gerenciado) **reabre** esta seção e exige DPA + SCC antes do
primeiro byte de dado pessoal.

## Manutenção deste documento

Este ROPA precisa refletir o schema real, não uma intenção. Regra
acrescentada à skill `nova-feature`
(`.claude/skills/nova-feature/SKILL.md`, Definition of Done): **toda feature
que introduz uma tabela nova com dado pessoal, ou muda finalidade/retenção/
operador de uma operação já registrada aqui, atualiza este arquivo no mesmo
PR.** Um ROPA desatualizado é pior do que a ausência dele — cria falsa
confiança numa eventual fiscalização.
