# DEPLOY.md — Go-live do LumiTrack

> Produzido pela Fase 13.5 do roadmap (`.claude/docs/roadmap.md`), Bloco A. Este documento é o procedimento reproduzível de deploy — se um passo daqui divergir do que o operador realmente fez, o documento está desatualizado, não o deploy.

## Dois caminhos

| | **Caminho A — demo pública** | **Caminho B — self-hosted** |
|---|---|---|
| **Situação** | **Vigente hoje** | Pronto, ainda não executado |
| **Onde** | Render + Neon (EUA), free tier | Máquina única no Brasil |
| **Decisão** | [ADR-0010](adr/0010-demo-publica-free-tier-render-neon.md) | [ADR-0008](adr/0008-hospedagem-brasil-oracle-always-free.md) + [ADR-0009](adr/0009-observabilidade-uptime-kuma-autohospedado.md) |
| **Artefatos** | `render.yaml`, `Dockerfile` (raiz), `deploy/demo-entrypoint.sh` | `docker-compose.yml`, `deploy/Caddyfile`, `deploy/provision-vm.sh`, scripts de backup |
| **Para quê** | Demonstração de portfólio, sem usuário real | **Migração obrigatória antes de operar com usuário real** |

O Caminho B não é legado nem alternativa hipotética: é o compromisso registrado na ADR-0010 e no `README.md`. Abrir o cadastro para pessoas reais exige migrar para ele **antes**, porque é ele que restaura a conclusão de conformidade da ADR-0008 (processamento no Brasil, sem operador estrangeiro).

---

# Caminho A — demo pública (Render + Neon)

## Topologia

```text
┌────────────────────────────────────────────────────────────┐
│  Render — site estático `lumitrack` (não hiberna)          │
│    /api/*  ──rewrite──► serviço `lumitrack-api`            │
│    /*      ──► index.html (fallback da SPA)                │
└────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────┐
│  Render — web service `lumitrack-api` (Docker, hiberna)    │
│    backend :$PORT  ◄── MQTT 1883 ──  iot-simulator         │
│    (mesmo container — ver Dockerfile na raiz)              │
└────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────┐
│  Neon — PostgreSQL gerenciado (sslmode=require)            │
└────────────────────────────────────────────────────────────┘
```

Três pontos do desenho são **forçados pela plataforma**, e mexer neles quebra a demo (racional completo na ADR-0010):

1. **Backend e simulador no mesmo container.** O Render não oferece background worker gratuito e só expõe HTTPS — nunca TCP bruto. Como o backend fala MQTT com o simulador, dois serviços separados não conseguiriam se comunicar.
2. **O rewrite `/api/*` é obrigatório.** O frontend chama a API por caminho relativo. O rewrite mantém tudo na mesma origem, preservando cookie `HttpOnly`, CSRF double-submit e a CSP sem nenhuma mudança de código.
3. **O banco não é o do Render.** O PostgreSQL gratuito do Render expira 30 dias após a criação; o Neon não expira.

## Pré-requisitos

- Conta no [Render](https://render.com) e no [Neon](https://neon.com) — nenhuma das duas exige cartão de crédito.
- Repositório no GitHub (o Render faz build a partir dele).
- Nenhum domínio próprio é necessário: ambos os serviços ganham subdomínio `.onrender.com`.

## Passo a passo

### 1. Criar o banco no Neon

Crie um projeto e copie a connection string. Ela precisa terminar com `?sslmode=require`. Essa é a connection string **administrativa** — só para migração e provisionamento (próximo passo), nunca para o runtime do backend.

### 2. Criar o papel de runtime (sem DDL)

O usuário do passo anterior é superusuário do projeto Neon — capaz de `CREATE`/`DROP`. Antes de apontar o Render para o banco, crie um papel separado, só com DML (defesa em profundidade, OWASP A04):

```bash
LUMITRACK_APP_PASSWORD='<senha-nova-gerada-aleatoriamente>' \
  psql '<connection-string-administrativa-do-neon>' -f deploy/create-app-role.sql
```

Monte a connection string de runtime trocando usuário/senha na mesma string do Neon: `postgresql://lumitrack_app:<LUMITRACK_APP_PASSWORD>@<mesmo-host-do-neon>/<mesmo-banco>?sslmode=require`. É essa — não a administrativa do passo 1 — que vai no `DATABASE_URL` do painel do Render (passo 4).

**Verificação (deve falhar):**

```bash
psql 'postgresql://lumitrack_app:<LUMITRACK_APP_PASSWORD>@<mesmo-host-do-neon>/<mesmo-banco>?sslmode=require' \
  -c 'CREATE TABLE regression_check (x int);'
# esperado: ERROR: permission denied for schema public
```

### 3. Aplicar as migrações e semear — da sua máquina

O Neon é acessível pela internet, então migração e seed rodam localmente apontando para ele. Não há release hook a configurar no Render. **Sempre com a connection string administrativa do passo 1** — o papel `lumitrack_app` não tem `CREATE`, migração falharia com ele.

```bash
cd backend
DATABASE_URL='<connection-string-administrativa-do-neon>' npm run db:migrate:deploy
DATABASE_URL='<connection-string-administrativa-do-neon>' npm run db:seed        # catálogo de distribuidoras
DATABASE_URL='<connection-string-administrativa-do-neon>' \
  CPF_CNPJ_ENCRYPTION_KEY='<mesmo-do-render>' \
  CPF_CNPJ_BLIND_INDEX_KEY='<mesmo-do-render>' \
  MFA_SECRET_ENCRYPTION_KEY='<mesmo-do-render>' \
  ADDRESS_ENCRYPTION_KEY='<mesmo-do-render>' \
  METER_CREDENTIAL_ENCRYPTION_KEY='<mesmo-do-render>' \
  SIMULATOR_BROKER_USERNAME='<mesmo-do-render, BROKER_USERNAME>' \
  SIMULATOR_BROKER_PASSWORD='<mesmo-do-render, BROKER_PASSWORD>' \
  npm run db:seed:demo
```

> **As 5 chaves de cifra têm que ser EXATAMENTE as mesmas do painel do Render.** O seed roda da sua máquina, mas grava no mesmo banco (Neon) que o backend em produção lê depois. Se as chaves não baterem, tudo que foi cifrado no seed (CPF/CNPJ, endereço, credencial do medidor) fica ilegível em runtime — `AES-256-GCM` falha com `Unsupported state or unable to authenticate data` (tag de autenticação não bate), não com uma mensagem óbvia de "chave errada". Gere as chaves **uma vez**, salve-as no Render primeiro, e só então rode o seed reaproveitando os mesmos valores — nunca o contrário.
>
> **Sobre o volume no Neon (0,5 GB no plano gratuito):** o seed de demonstração **não gera histórico** — cria só a topologia (11 medidores, submedição por cômodo/equipamento) e os alertas, já configurados. Todo `MeterReading` nasce da ingestão IoT real a partir do deploy. Isso resolve na origem o estouro de volume que um seed com bulk insert causaria; o que resta acompanhar é o **crescimento das leituras ao vivo** ao longo do tempo — o `RetentionService` ainda não cobre `MeterReading` (item da Fase 14), então vale revisar o volume periodicamente.

### 4. Criar os serviços no Render

No painel do Render, escolha **Blueprint** e aponte para o repositório. Ele lê o `render.yaml` e cria os dois serviços, pedindo os valores marcados como `sync: false` (ver checklist abaixo) — **`DATABASE_URL` aqui é a connection string de `lumitrack_app` do passo 2, não a administrativa.**

### 5. Ajustar o destino do rewrite

Depois que o serviço `lumitrack-api` existir, copie a URL real dele e substitua no `render.yaml`:

```yaml
- type: rewrite
  source: /api/*
  destination: https://lumitrack-api.onrender.com/api/*   # ← a URL real
```

Blueprints do Render não interpolam URL de serviço em destino de rota, então este passo é manual. Commit + push aplica.

### 6. Verificar

Abra a URL do site estático. Ver a seção "Verificação ponta a ponta", abaixo.

## Checklist de variáveis — Caminho A

Definidas em `render.yaml` (não precisa fazer nada):

| Variável | Valor | Por quê |
|---|---|---|
| `NODE_ENV` | `production` | Liga as validações fail-closed de `config/env.ts`. |
| `REGISTRATION_ENABLED` | `false` | **A premissa de conformidade inteira da ADR-0010.** O default do código é `true`. |
| `DEMO_LOGIN_ENABLED` | `true` | Mantém o botão de demonstração funcional com o cadastro fechado. |
| `IOT_ALLOWED_HOSTS` | `127.0.0.1/32` | Simulador no mesmo container = loopback. Não afrouxa a proteção de SSRF. |
| `DEMO_BOOTSTRAP_ENABLED` | `true` | Recria os devices do simulador a cada despertar — sem isso o painel acorda sem dado ao vivo. |
| `API_HOST` / `BROKER_HOST` | `127.0.0.1` | A API de controle e o broker do simulador nunca saem do container. |

Preenchidas por você no painel (`sync: false`):

| Variável | Valor | Como gerar |
|---|---|---|
| `DATABASE_URL` | Connection string de `lumitrack_app` (passo 2), **não** a administrativa | Com `?sslmode=require`. |
| `JWT_SECRET` | Valor novo | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CPF_CNPJ_ENCRYPTION_KEY`, `CPF_CNPJ_BLIND_INDEX_KEY`, `MFA_SECRET_ENCRYPTION_KEY`, `ADDRESS_ENCRYPTION_KEY`, `METER_CREDENTIAL_ENCRYPTION_KEY` | 5 valores novos, **todos distintos** | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — nunca reaproveite a mesma chave entre categorias de dado. |
| `SIMULATOR_API_TOKEN`, `BROKER_USERNAME`, `BROKER_PASSWORD` | Valores novos | Precisam bater com o que você usou no `db:seed:demo` do passo 3. |
| `CORS_ORIGIN`, `FRONTEND_URL` | URL do site estático | Ex.: `https://lumitrack.onrender.com`. |
| `PUBLIC_API_ORIGIN` | **Ver abaixo** | O host que o backend de fato recebe. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Qualquer placeholder | Obrigatórias no schema (`config/env.ts`), sem default — o backend recusa subir sem elas. A demo não exercita "esqueci minha senha" no checklist abaixo, então qualquer valor satisfaz a validação; só funciona de verdade se você contratar um provedor SMTP real (o que cria um operador — atualizar o ROPA nesse caso). |

### O erro mais provável no primeiro deploy: `PUBLIC_API_ORIGIN`

`shared/security/httpsRedirect.ts` recusa com **400** qualquer requisição cujo `Host` não seja exatamente `PUBLIC_API_ORIGIN` (proteção contra open redirect via `Host` forjado, issue #183). Atrás do rewrite do Render, o `Host` que chega ao backend pode ser o do próprio serviço da API **ou** o do site estático, dependendo de como a plataforma encaminha.

- **Sintoma:** *toda* requisição à API responde 400, e o frontend não sai da tela de carregamento.
- **Diagnóstico:** nos logs do serviço `lumitrack-api`, veja qual `Host` chegou.
- **Correção:** ajuste `PUBLIC_API_ORIGIN` para esse host, com `https://` e sem barra final.

### O painel abre, mas a potência ao vivo nunca aparece (SSE travado)

O rewrite `/api/*` do site estático **não sustenta conexão de longa duração** — ele foi desenhado para redirecionar página, não para proxiar streaming. O stream SSE (`GET /api/iot/stream`) trava sem nunca entregar dado quando passa por ele, mesmo com o backend funcionando perfeitamente.

- **Sintoma:** login funciona, o resto da API responde normal, mas "Potência agora"/"Sem leitura recente" nunca atualiza. No DevTools → Network, a requisição para `/api/iot/stream` fica pendente com "Provisional headers are shown" (o browser nunca recebe resposta real).
- **Diagnóstico:** teste a API **direto**, sem passar pelo rewrite: `curl -N -H "Cookie: lumitrack_session=<valor-do-cookie>" https://lumitrack-api.onrender.com/api/iot/stream`. Se aparecer `event: connected` e depois `: keep-alive` a cada 30s, a API está certa — o problema é só o rewrite.
- **Correção:** já resolvido no repositório (ADR-0010) — `VITE_SSE_URL` no `render.yaml` aponta o frontend direto para a origem da API só para essa chamada, cross-origin. Duas camadas precisaram ceder, nessa ordem de descoberta:
  1. **CSP do próprio `index.html`** (`connect-src 'self'`) bloqueia a conexão no navegador antes mesmo de CORS entrar em jogo (erro no console: "Refused to connect because it violates the document's Content Security Policy"). `VITE_CSP_CONNECT_EXTRA` (`render.yaml`) libera a origem da API especificamente.
  2. **Cookie de sessão nunca atravessa domínio** (a conexão passa a responder 401): o cookie foi definido pelo navegador para o domínio do site estático, não para o da API — `SameSite` não resolve isso (é o `Domain` do cookie, que nunca inclui o outro serviço; `Domain=.onrender.com` é rejeitado por ser sufixo público). A correção **não** é enfraquecer o cookie — é não depender dele nessa chamada: `POST /api/iot/stream-ticket` autentica normalmente (cookie, mesma origem, via rewrite) e emite um ticket de uso único de 30s; o SSE troca esse ticket pela conexão via query string (`?ticket=...`), sem cookie nenhum. Todo cookie da aplicação continua `sameSite: "lax"`, sem exceção.

  Se você mudar o nome do serviço da API no Render, atualize as **duas** referências junto: `VITE_SSE_URL` e `VITE_CSP_CONNECT_EXTRA` (o destino do rewrite, item 5 do passo a passo, é o terceiro lugar de sempre).

## Verificação ponta a ponta

- [ ] A interface carrega instantaneamente (site estático não hiberna).
- [ ] O login de demonstração entra (a primeira tentativa pode levar ~60–90s — é o cold start da API).
- [ ] O painel mostra potência ao vivo nos 11 medidores, via SSE.
- [ ] `POST /api/users` responde **403** (cadastro fechado — gate #1).
- [ ] Provocar uma anomalia num device do simulador dispara alerta e notificação.
- [ ] Nenhuma conexão de saída bloqueada pelo guard de SSRF.

## Limites do free tier a acompanhar

- **750 horas-instância/mês** no Render, compartilhadas pela conta inteira — um segundo serviço gratuito concorre pela mesma cota.
- **Hibernação após 15 min** sem tráfego, com cold start de ~60–90s. Comportamento esperado, não incidente.
- **0,5 GB no Neon** — ver o aviso de volume do passo 3.

## Keep-alive (evitar hibernação)

**Decisão:** [ADR-0011](adr/0011-keep-alive-monitor-externo-uptimerobot.md) — dois mecanismos independentes de ping em `/health`, o suficiente para reduzir (não eliminar) a chance de a demo hibernar entre visitas.

1. **UptimeRobot** (primário) — a cada 5 min. Configuração manual, fora do repositório:
   - Criar conta gratuita em [uptimerobot.com](https://uptimerobot.com), sem cartão.
   - Novo monitor **HTTP(s)**, URL `https://lumitrack-api.onrender.com/health`, intervalo **5 minutos**.
   - Alerta por e-mail (ou Telegram) para o autor quando o monitor detectar `down`.
2. **`.github/workflows/keep-alive.yml`** (redundância) — a cada 10 min, cron deslocado para minutos não-redondos. Já implementado; nenhuma ação manual.

`/health` é público, sem autenticação, e **excluído do log de acesso** (`backend/src/app.ts`, `autoLogging.ignore`) — nenhum dos dois mecanismos processa dado pessoal, então esta decisão não abre a tabela de operadores do `ROPA.md` (ver ADR-0011 para o raciocínio completo).

**Limite conhecido:** `schedule` do GitHub Actions é melhor-esforço — pode atrasar ou descartar disparos sob carga (issue #222). A redundância reduz o impacto; não garante zero gap. Se gaps grandes continuarem incomodando na prática, a correção definitiva é o upgrade pago do Render (Starter, ~US$ 7/mês) — não adotado por falta de necessidade demonstrada.

---

# Caminho B — self-hosted (migração para o Brasil)

> **Quando usar:** antes de qualquer operação com usuário real. É este caminho que restaura a conclusão de conformidade da ADR-0008 — processamento exclusivamente no Brasil, sem operador estrangeiro, sem transferência internacional.

## Topologia

Tudo numa única máquina, orquestrado via Docker Compose (`docker-compose.yml` na raiz):

```text
┌──────────────────────────────────────────────────────────────────┐
│  VM Ubuntu 24.04 — datacenter no Brasil                           │
│                                                                    │
│   caddy (80/443, TLS automático) ── publicado no host             │
│     ├── /api/*  → backend:3333                                    │
│     └── /*      → /srv (bind mount de frontend/dist, build local) │
│                                                                    │
│   backend:3333 (rede interna) ── /health monitorado pelo Kuma     │
│     └── network_mode: service:backend ← simulator (1883, 4100)    │
│                                          só alcançável de dentro   │
│                                          do container backend     │
│                                                                    │
│   postgres:5432 (rede interna, sem porta publicada)                │
│   uptime-kuma:3001 (só 127.0.0.1 do host — via túnel SSH)           │
└──────────────────────────────────────────────────────────────────┘
```

Ver [ADR-0008](adr/0008-hospedagem-brasil-oracle-always-free.md) para o racional (por que máquina única, por que sem operador estrangeiro) e [ADR-0009](adr/0009-observabilidade-uptime-kuma-autohospedado.md) para a escolha do Uptime Kuma.

## Pré-requisitos

- VM Ubuntu 24.04 com datacenter no Brasil, acesso root por SSH e portas 80/443 liberáveis.
- Domínio real apontando (registro A/AAAA) para o IP público da VM.
- Chave SSH configurada (nunca senha).

## Passo a passo

### 1. Provisionar o runtime da VM

```bash
scp deploy/provision-vm.sh usuario@<ip-da-vm>:~
ssh usuario@<ip-da-vm>
sudo ./provision-vm.sh
```

Instala Docker Engine + Compose plugin, cria o usuário de serviço `lumitrack` e configura o `ufw` (só 22/80/443 liberados). Siga as instruções finais do script para o endurecimento manual de SSH.

### 2. Clonar o repositório

```bash
sudo -u lumitrack git clone https://github.com/<owner>/lumitrack.git /opt/lumitrack
cd /opt/lumitrack
```

### 3. Configurar as variáveis de ambiente

```bash
cp backend/.env.example backend/.env
cp iot-simulator/server/.env.example iot-simulator/server/.env
cp deploy/.env.example deploy/.env
```

Ver o checklist abaixo antes de prosseguir.

### 4. Build do frontend

O frontend é servido como arquivo estático pelo Caddy (bind mount) — não tem container próprio:

```bash
cd frontend && npm ci && npm run build && cd ..
```

`frontend/dist/` precisa existir antes do `docker compose up`.

### 5. Subir o banco e aplicar as migrações

Subir o `postgres` já cria o papel de runtime sem DDL automaticamente (primeiro boot, `deploy/create-app-role.sql` — ver `docker-compose.yml`). A migração, porém, **precisa do usuário administrativo** — o `DATABASE_URL` de `backend/.env` (o de runtime, `lumitrack_app`) não tem `CREATE`:

```bash
docker compose up -d postgres
set -a && source deploy/.env && set +a
docker compose run --rm \
  -e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public" \
  backend npm run db:migrate:deploy
```

**Verificação (deve falhar):**

```bash
docker compose exec postgres psql -U lumitrack_app -d "$POSTGRES_DB" -c 'CREATE TABLE regression_check (x int);'
# esperado: ERROR: permission denied for schema public
```

### 6. Subir o stack completo

```bash
docker compose up -d
docker compose ps # todos os serviços "healthy"/"running"
curl -I https://<seu-dominio>/ # frontend estático respondendo via Caddy
docker compose exec backend curl -sf http://localhost:3333/health # /health não é proxiado publicamente
```

### 7. Popular a demonstração

```bash
docker compose exec backend npm run db:seed:demo
./deploy/seed-simulator-devices.sh
```

### 8. Observabilidade

Acesse o Uptime Kuma via túnel SSH (`ssh -L 3001:localhost:3001 usuario@<ip-da-vm>`, depois `http://localhost:3001` no navegador local), crie o monitor HTTP apontando para `http://backend:3333/health` e configure a notificação (Telegram recomendado). Ver [ADR-0009](adr/0009-observabilidade-uptime-kuma-autohospedado.md) para a limitação aceita (não detecta a VM inteira fora do ar).

### 9. Verificação ponta a ponta

- [ ] Login com conta de demonstração funciona (`POST /api/auth/demo-login`).
- [ ] O painel mostra potência ao vivo nos 11 medidores, via SSE.
- [ ] Provocar uma anomalia num device do simulador dispara alerta e notificação.
- [ ] Nenhuma conexão de saída bloqueada pelo guard de SSRF.
- [ ] `psql` a partir de fora da VM é recusado.
- [ ] Certificado TLS válido, `http://` redireciona para `https://`, `Host` forjado recebe 400.
- [ ] **Documentos legais atualizados para o cenário brasileiro:** `frontend/src/legal/privacy-policy.md` § 4 (volta a declarar processamento exclusivamente no Brasil, sem operadores), tabela de operadores de `.claude/docs/ROPA.md` (volta a ficar vazia) e `.claude/project_context/09-conformidade-legal.md`. Incrementar `CURRENT_CONSENT_VERSION` (`backend/src/shared/legal/consentVersion.ts`) **em sincronia** com a versão declarada no cabeçalho da Política — se divergirem, o usuário aceita um texto e o sistema grava outro.

## Checklist de `.env` de produção — Caminho B

| Variável | Onde | Produção | Por quê |
|---|---|---|---|
| `NODE_ENV` | `backend/.env` | `production` | Liga as validações fail-closed de `config/env.ts`. |
| `DATABASE_URL` | `backend/.env` | `postgresql://lumitrack_app:<LUMITRACK_APP_PASSWORD>@postgres:5432/<POSTGRES_DB>?schema=public` | Host é `postgres` (nome do serviço no compose), nunca `localhost`. Usuário `lumitrack_app` (sem DDL, criado automaticamente por `deploy/create-app-role.sql` no primeiro boot) — **não** `POSTGRES_USER`, que fica só para migração (passo 5). Senha deve bater com `LUMITRACK_APP_PASSWORD` de `deploy/.env`. |
| `JWT_SECRET` | `backend/.env` | Novo valor gerado | Gate de go-live #7. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `CPF_CNPJ_ENCRYPTION_KEY`, `CPF_CNPJ_BLIND_INDEX_KEY`, `MFA_SECRET_ENCRYPTION_KEY`, `ADDRESS_ENCRYPTION_KEY`, `METER_CREDENTIAL_ENCRYPTION_KEY` | `backend/.env` | 5 valores novos, todos distintos | Gate de go-live #7. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — nunca reaproveitar a mesma chave entre categorias de dado. |
| `CORS_ORIGIN` | `backend/.env` | `https://<seu-dominio>` | Nunca `*` em produção. |
| `PUBLIC_API_ORIGIN` | `backend/.env` | `https://<seu-dominio>` | Gate de go-live #5 — host canônico do redirect HTTPS e da checagem de `Host` forjado. |
| `FRONTEND_URL` | `backend/.env` | `https://<seu-dominio>` | Compõe o link de e-mails transacionais. |
| `REGISTRATION_ENABLED` | `backend/.env` | `false` enquanto for demonstração | Default do código é `true`. Ao abrir para usuários reais, este caminho é o pré-requisito. |
| `DEMO_LOGIN_ENABLED` | `backend/.env` | `true` | Mantém o botão de demo funcional com o cadastro fechado. |
| `IOT_ALLOWED_HOSTS` | `backend/.env` | `127.0.0.1/32` | O simulador compartilha o namespace de rede do container `backend` — o broker está em loopback. |
| `SMTP_*` | `backend/.env` | Sandbox, salvo se contratar provedor | Sem provedor, "esqueci minha senha" não é funcional. Contratar um cria um **operador** (DPA no ROPA). |
| `SIMULATOR_API_TOKEN`, `BROKER_USERNAME`, `BROKER_PASSWORD` | `iot-simulator/server/.env` | Valores novos gerados | Devem bater com `SIMULATOR_BROKER_USERNAME`/`SIMULATOR_BROKER_PASSWORD` do `db:seed:demo`. |
| `DEMO_BOOTSTRAP_ENABLED` | `iot-simulator/server/.env` | `false` | Aqui o serviço não hiberna; os devices são criados uma vez por `deploy/seed-simulator-devices.sh`. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `deploy/.env` | Valores novos gerados | Usuário administrativo — só para migração (passo 5), nunca para `DATABASE_URL` do backend. |
| `LUMITRACK_APP_PASSWORD` | `deploy/.env` | Valor novo gerado, distinto de `POSTGRES_PASSWORD` | Senha do papel de runtime sem DDL. Deve bater com o `DATABASE_URL` acima. |
| `DOMAIN` | `deploy/.env` | Domínio real | Repassado ao Caddy para o certificado Let's Encrypt. |
| `BACKUP_ENCRYPTION_PUBLIC_KEY` | `deploy/.env` | Chave pública `age1...` gerada fora da VM | `age-keygen -o backup-key.txt` **na sua máquina**, nunca na VM — guarde a chave privada fora do repositório. Ver "Backup e restauração testada" abaixo. |

## Backup e restauração testada

**Chave de cifra (gerar UMA VEZ, fora da VM, antes do primeiro backup):**

```bash
age-keygen -o backup-key.txt   # roda na SUA máquina, não na VM
```

Copie a linha `Public key: age1...` para `BACKUP_ENCRYPTION_PUBLIC_KEY` em `deploy/.env`. Guarde `backup-key.txt` (a chave **privada**) em local seguro fora do repositório e fora da VM — sem ela, os backups são irrecuperáveis, inclusive por você. `deploy/provision-vm.sh` já instala o pacote `age` na VM (só precisa dele para cifrar; nunca da chave privada para decifrar).

**Automático:** `deploy/lumitrack-backup.timer` roda `deploy/backup-postgres.sh` diariamente (`pg_dump | gzip | age -r <chave-pública>`, retenção de 14 dias por padrão). O script recusa rodar (`exit 1`) se `BACKUP_ENCRYPTION_PUBLIC_KEY` não estiver definida — nunca grava um dump em texto claro por omissão. Instalar:

```bash
sudo cp deploy/lumitrack-backup.service deploy/lumitrack-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lumitrack-backup.timer
```

**Restauração testada (obrigatória ao menos uma vez — um backup nunca restaurado não é um backup — registrar em `deploy/BACKUP-RESTORE-LOG.md` a cada execução, nunca apagar entradas antigas):**

```bash
# 1. Banco descartável, isolado do de produção
docker run --rm -d --name lumitrack-restore-test \
    -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=restore_test postgres:16

# 2. Decifrar (chave PRIVADA, trazida de fora da VM só para este teste) e restaurar o dump mais recente
age -d -i backup-key.txt /opt/lumitrack/backups/lumitrack-<timestamp>.sql.gz.age | \
    gunzip | \
    docker exec -i lumitrack-restore-test psql -U postgres -d restore_test

# 3. Conferir que os dados vieram (exemplo: contagem de usuários)
docker exec lumitrack-restore-test psql -U postgres -d restore_test -c 'SELECT count(*) FROM "users";'

# 4. Descartar
docker rm -f lumitrack-restore-test
```

## Rollback

`prisma migrate deploy` é **forward-only** — não existe `migrate down` automático. Reverter código sem reverter uma migração aplicada é seguro só se a migração for aditiva (nova coluna/tabela); reverter uma migração destrutiva exige uma migração de correção nova, não um `git checkout` do schema antigo.

```bash
git log --oneline -5 # identificar o commit anterior
git checkout <sha-anterior>
docker compose build backend simulator
docker compose up -d
```

No Caminho A, o rollback é o botão de *rollback* do próprio Render (reimplanta o deploy anterior) — a mesma ressalva sobre migrações forward-only continua valendo.

## Troubleshooting

```bash
docker compose ps                    # estado/healthcheck de cada serviço
docker compose logs -f backend       # logs em tempo real
docker compose logs -f caddy         # erros de TLS/proxy
docker compose exec backend sh       # shell dentro do container, se precisar depurar
```
