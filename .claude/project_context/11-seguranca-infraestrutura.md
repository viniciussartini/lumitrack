# 11 — Segurança de Infraestrutura (banco, pipeline, deploy, segredos)

> Fonte única dos controles de segurança **em volta** da aplicação. O `05-security-standards.md` cobre o código; este arquivo cobre banco de dados, CI/CD, ambientes de deploy e ciclo de vida de segredos.
>
> **Leitura obrigatória:** `scaffold-projeto` (fundação) e `auditoria-seguranca` (verificação). As skills de feature leem o `05`; só recorrem aqui quando a mudança tocar migração, pipeline, ambiente ou segredo.
>
> **Particularidades por tecnologia** (PostgreSQL, SQL Server, MongoDB, Redis, nginx, containers, object storage, e-mail) estão em `12-seguranca-por-tecnologia.md`.
>
> **Prioridades:** `[P0]` fundação — implementar antes do primeiro deploy · `[P1]` endurecimento — antes de tráfego real ou dado de terceiro · `[P2]` maturidade — quando escala, equipe ou requisito exigirem.

## Referência de profundidade: OWASP ASVS 5.0

O Top 10 é ranking de risco (consciência); o **ASVS é a checklist verificável** — ~350 requisitos em 17 capítulos, em três níveis cumulativos.

- **Alvo do projeto: ASVS L2.** L1 é piso absoluto e não é suficiente para software profissional; **L2 é o padrão** para qualquer sistema que trate dado de usuário, e obrigatório onde há PII (cruza com `09`).
- **L3** para componentes de alta garantia: autenticação, autorização, pagamento, e qualquer fluxo com dado sensível na acepção do art. 5º, II da LGPD.
- Muitos requisitos de L1/L2 são verificáveis por análise estática, varredura de dependências e revisão de configuração — priorize automatizá-los (princípio do `06`: o que pode virar regra, vira regra).
- Registre o nível-alvo por módulo quando divergir do padrão, e justifique em ADR.

---

## 1. Banco de dados

### Acesso e privilégio

- **[P0] Menor privilégio com usuários separados.** O usuário de runtime tem apenas DML (`SELECT/INSERT/UPDATE/DELETE`) nas tabelas do app — **sem DDL, sem superuser, sem owner do schema**. Migrações usam um segundo usuário, com credencial distinta, usada só pelo pipeline. Efeito: uma injeção bem-sucedida vira leitura indevida, não `DROP TABLE`.
- **[P0] TLS explícito na string de conexão** (`sslmode=require` ou superior; `verify-full` quando o provedor suportar). Não confie no default do provedor — ele muda.
- **[P0] Credencial de banco nunca no código nem no bundle** (ver seção 4).
- **[P2] Row-Level Security** quando houver multi-tenant: isolamento na camada do banco, não só no `WHERE` da aplicação — defesa em profundidade contra IDOR de tenant.
- **[P2] Usuário somente-leitura** separado para BI, relatórios e debugging em produção.

### Consultas

- **[P0] `$queryRaw` / `$executeRaw` são exceção, não ferramenta.** É a porta dos fundos que anula a garantia de parametrização do A05. Regra: proibido por padrão; quando inevitável, usar **`Prisma.sql` com interpolação parametrizada** (nunca template string crua), com justificativa em comentário funcional e revisão obrigatória no PR.
- **[P0] Mass assignment é bloqueado por allowlist.** `data: req.body` é proibido. O schema Zod da borda **enumera os campos permitidos** — validar tipo não é o mesmo que restringir campo. Campos como `role`, `isAdmin`, `ownerId`, `status` de pagamento nunca vêm do cliente.
- **[P1] Paginação obrigatória com teto** em toda listagem (limite default e máximo); sem isso, `?limit=999999` é exaustão de recurso.
- **[P1] Timeout de query** e **limite de pool** configurados — exaustão de conexões é o DoS mais barato contra API com banco.

### Dados e ciclo de vida

- **[P0] Seed e dump jamais contêm PII real.** Dados de desenvolvimento e teste são sintéticos ou anonimizados. Cópia de produção para dev é um vazamento sob a LGPD (ver `09`), mesmo em máquina local.
- **[P0] Backup com restauração testada.** Backup nunca restaurado não é backup: agende um teste de restauração periódico e registre a data do último teste bem-sucedido. Backup criptografado em repouso; PITR habilitado quando o provedor oferecer.
- **[P1] Migração destrutiva exige gate explícito.** `DROP COLUMN`, `DROP TABLE`, alteração de tipo com perda e renomeação passam por revisão nomeada no PR, com plano de rollback. Migração é a via mais comum de perda de dado irreversível.
- **[P1] Estratégia de deleção definida** — soft delete (com expurgo programado) vs. hard delete. Cruza diretamente com o **direito de eliminação** do `09`: soft delete sem expurgo **não cumpre** o pedido do titular.
- **[P1] Retenção por tabela** declarada para dados pessoais (ver `09`), com rotina de expurgo verificável.
- **[P2] Criptografia em nível de coluna** para dado sensível além do que o TLS e o disco cobrem.
- **[P2] Auditoria de acesso a dados sensíveis** (quem leu o quê), separada do log de aplicação.

---

## 2. CI/CD (GitHub Actions)

- **[P0] Actions pinadas por SHA completo**, não por tag: `uses: actions/checkout@<sha40>`. Tag é mutável — foi o vetor dos comprometimentos recentes de Actions populares. Cobre a lacuna do A03 no lado do pipeline.
- **[P0] `permissions:` mínimo em todo workflow.** Declare no topo `permissions: contents: read` e eleve por job apenas onde necessário. O token default é amplo demais; sem restrição, um step comprometido escreve no repositório.
- **[P0] Nunca `pull_request_target` com checkout do código do PR.** Essa combinação executa código de terceiro com acesso aos segredos do repositório. Se precisar de contexto do PR, separe em dois workflows sem exposição de segredo.
- **[P0] Secret scanning + push protection** habilitados no repositório; complemente com `gitleaks` no CI. Isso transforma "não commitar segredo" de disciplina em bloqueio mecânico — mesmo princípio dos hooks do kit.
- **[P0] Segredo nunca em log de build.** Sem `echo` de variável, sem `set -x` em step com credencial; mascare saídas de terceiros.
- **[P1] SAST no pipeline** (CodeQL) + **dependency review** em PR, além do `npm audit` que o `05` já exige.
- **[P1] OIDC para credenciais de nuvem** em vez de chave de longa duração armazenada como secret.
- **[P1] Branch protection como controle documentado:** `main` protegida, PR obrigatório, status checks obrigatórios, sem force-push, histórico linear. **[EQUIPE]** revisão obrigatória por outra pessoa e `CODEOWNERS` para caminhos sensíveis (auth, migrações, pipeline). No modo solo, o agente `revisao-codigo` cumpre o papel de revisão antes do merge.
- **[P1] Ambientes protegidos** (GitHub Environments) para produção: segredos escopados por ambiente e revisor obrigatório no deploy.
- **[P2] Assinatura de commits** (`git commit -S`) exigida na `main`.
- **[P2] Proveniência de build / SLSA** e SBOM gerado no release.
- **[P2] Runner efêmero** se algum dia migrar de runner hospedado.

---

## 3. Ambientes e deploy

- **[P0] Isolamento real entre ambientes.** Produção, staging e preview têm **banco, segredos e credenciais próprios**. Preview deployment apontando para banco de produção é o furo mais comum e mais invisível deste bloco.
- **[P0] Preview/staging sem dado real** — dataset sintético ou anonimizado (cruza com `09`).
- **[P0] Configuração separada por ambiente**, sem fallback silencioso para valores de desenvolvimento em produção (o `05` já exige; aqui vale a verificação no deploy).
- **[P1] Preview deployments não são públicos** quando expõem funcionalidade não lançada: proteção por autenticação da plataforma.
- **[P1] Rollback ensaiado.** Saiba reverter deploy e migração antes de precisar; documente o procedimento.
- **[P1] Healthcheck e alerta de indisponibilidade** ligados ao canal que a equipe realmente lê.
- **[P2] Least privilege nas contas de plataforma** (Vercel/Railway/Neon): acesso por função, MFA obrigatório, sem conta compartilhada. **[EQUIPE]** revisão de acesso periódica, remoção imediata no offboarding e rotação dos segredos que a pessoa conhecia.

---

## 4. Ciclo de vida de segredos

- **[P0] Inventário de segredos:** o que existe, onde vive, quem tem acesso, quando foi rotacionado pela última vez. Sem inventário não há rotação nem resposta a incidente.
- **[P0] Procedimento de vazamento — a ordem importa:** **1) revogar/rotacionar** o segredo, **2) só então** limpar o histórico do git. Fazer o inverso deixa o segredo válido durante toda a reescrita do histórico, que é justamente quando ele fica mais visível. Depois: verificar logs de uso indevido e registrar o incidente conforme `09`.
- **[P0] `.env.example` sem valores reais** — apenas nomes de variáveis e formato esperado.
- **[P1] Rotação periódica** (defina o intervalo por tipo de segredo) e **rotação obrigatória** em qualquer suspeita, em offboarding e ao fim de contrato com terceiro.
- **[P1] Escopo mínimo por segredo:** chave de API com permissão apenas do que usa; uma chave por ambiente, nunca reaproveitada.
- **[P2] Secret manager** com versionamento e trilha de auditoria quando o volume de segredos ou o tamanho da equipe justificar.

---

## 5. Definition of Done — Infraestrutura

- Usuário de runtime do banco **não consegue** executar DDL.
- Restauração de backup testada, com data registrada.
- Nenhum ambiente não-produtivo contém PII real.
- Todo workflow declara `permissions:` e usa actions pinadas por SHA.
- Push protection e secret scanning ativos.
- Todo segredo tem dono, escopo e data da última rotação.
- Procedimento de vazamento documentado e conhecido por quem tem acesso.
