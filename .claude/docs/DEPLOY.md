# DEPLOY.md — Go-live do LumiTrack

> Produzido pela Fase 13.5 do roadmap (`.claude/docs/roadmap.md`), Bloco A, e executado de fato na VPS pela **Fase 13.7** (separação de ambientes, ADR-0012). Este documento é o procedimento reproduzível de deploy — se um passo daqui divergir do que o operador realmente fez, o documento está desatualizado, não o deploy.

## Dois ambientes

| | **Produção — VPS Hostinger** | **Staging/integração — Render + Neon** |
|---|---|---|
| **Branch** | `main` | `staging` |
| **Onde** | Máquina única, São Paulo | Render + Neon (EUA), free tier |
| **Decisão** | [ADR-0008](adr/0008-hospedagem-brasil-oracle-always-free.md) + [ADR-0009](adr/0009-observabilidade-uptime-kuma-autohospedado.md) + [ADR-0012](adr/0012-separacao-producao-vps-staging-render-neon.md) | [ADR-0010](adr/0010-demo-publica-free-tier-render-neon.md), continua vigente com o escopo redefinido pela ADR-0012 |
| **Artefatos** | `docker-compose.yml`, `deploy/Caddyfile`, `deploy/provision-vm.sh`, scripts de backup | `render.yaml`, `Dockerfile` (raiz), `deploy/demo-entrypoint.sh` |
| **Para quê** | O produto real — o que fica acessível ao público como "o LumiTrack" | Validação online de cada PR antes de chegar em produção; também onde a demo de portfólio permanece enquanto a VPS estabiliza |

**Fluxo:** `feat/fix/epic/{N}-...` → PR → `staging` (deploy automático no Render) → validado online → PR → `main` (deploy na VPS, ver "Caminho B" abaixo). Detalhe da convenção em `08-convencoes-git.md`.

O Caminho B não é legado nem alternativa hipotética: é a produção real desde a Fase 13.7, e restaura a conclusão de conformidade da ADR-0008 (processamento no Brasil, sem operador estrangeiro). O staging (Render+Neon, antigo "Caminho A") mantém a exposição residual registrada na ADR-0010 — por isso continua com cadastro fechado.

---

## Conceitos básicos, para quem nunca fez isso

Esta seção existe porque o Caminho B (a VPS) foi executado, na prática, por alguém sem experiência prévia em administrar servidor. Se você já manja de SSH, variáveis de ambiente e Docker, pule direto para "Pré-requisitos" do Caminho B. Se não, os termos abaixo aparecem o tempo todo no resto do documento — vale ler antes.

- **Terminal:** a janela de texto onde você digita comandos em vez de clicar em botões. No Mac é o app "Terminal"; no Windows, o PowerShell ou o WSL; no Linux, qualquer emulador de terminal. Todo bloco de código cinza neste documento é algo para **colar dentro de um terminal e apertar Enter**.
- **SSH:** o protocolo que permite abrir um terminal *dentro* de outro computador (a VPS), pela internet, de forma cifrada. `ssh usuario@ip-da-vm` abre uma sessão de terminal na VPS — a partir daquele momento, todo comando que você digitar roda **lá**, não no seu computador. É assim que se administra um servidor sem monitor nem teclado físico.
- **Chave SSH em vez de senha:** um par de arquivos (uma chave pública, que fica no servidor, e uma chave privada, que fica só no seu computador e nunca deve ser copiada para lugar nenhum) que substitui a senha para provar "sou eu". É mais seguro porque não pode ser adivinhada por tentativa e erro — por isso um dos primeiros passos deste guia é desligar login por senha (passo 2).
- **VPS ("Virtual Private Server"):** um computador que você aluga, ligado 24h, com IP público fixo — diferente do seu computador pessoal, que não é feito para ficar acessível pela internet o tempo todo. É "seu", mas alguém mais (a Hostinger, no seu caso) cuida do hardware físico.
- **`.env` e segredo (*secret*):** um arquivo de texto simples (`chave=valor`, uma por linha) com as configurações e senhas que um programa lê ao iniciar. Nunca vai para o Git (por isso `.env` está no `.gitignore` e só o `.env.example` — sem valores reais — é versionado). "Segredo" = qualquer valor desse arquivo que, se vazar, dá acesso a alguma coisa (senha de banco, chave de criptografia, token de API). A regra de ouro deste guia: **todo segredo é gerado dentro da própria VPS, com um comando, e nunca digitado, colado ou enviado por fora dela** — inclusive nesta conversa com o Claude Code, que nunca vê o valor real de um segredo seu.
- **Docker / container:** um jeito de empacotar um programa junto com tudo que ele precisa para rodar (bibliotecas, versão exata da linguagem), isolado do resto do sistema. Um "container" é uma instância rodando desse pacote. O LumiTrack roda como 5 containers (backend, banco de dados, simulador de medidores, Caddy, Uptime Kuma) orquestrados juntos pelo `docker-compose.yml` — o comando `docker compose up -d <nome>` liga um container, `docker compose logs <nome>` mostra o que ele andou "dizendo".
- **Domínio e DNS:** o domínio (ex.: `<seu-dominio-real>`) é o nome amigável; o DNS é a "lista telefônica" que traduz esse nome para o IP numérico real da VPS. Sem essa tradução configurada, digitar o domínio não leva a lugar nenhum — é o assunto da seção "Comprar o domínio e apontar o DNS" mais abaixo.
- **TLS / HTTPS / certificado:** o cadeado do navegador. Garante que ninguém no meio do caminho consegue ler ou alterar o tráfego entre o visitante e o site. Neste projeto, quem obtém e renova o certificado sozinho é o Caddy (passo 8) — você não baixa nem instala certificado manualmente.
- **Convenção de placeholders usada neste guia:** qualquer texto entre `<` e `>` (ex.: `<usuario>`, `<ip-da-vm>`, `<seu-dominio-real>`) é um valor que **você** substitui pelo seu próprio — nunca cole o placeholder literal, com os sinais de `<` `>` inclusos.

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
| `IOT_ALLOWED_HOSTS` | `localhost,127.0.0.1/32` | Simulador no mesmo container = loopback. **`localhost` precisa entrar como hostname, não só o CIDR:** dentro do container o nome resolve para IPv4 **e** IPv6, e um CIDR só de IPv4 deixa o `::1` de fora, fazendo a checagem de SSRF negar a conexão do medidor (mesmo achado documentado no Caminho B). Não afrouxa a proteção. |
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

# Caminho B — self-hosted (produção, VPS Hostinger)

> **Quando usar:** é a produção real, branch `main` (Fase 13.7, ADR-0012). Restaura a conclusão de conformidade da ADR-0008 — processamento exclusivamente no Brasil, sem operador estrangeiro, sem transferência internacional.

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
- Chave SSH configurada (nunca senha).
- Domínio real apontando (registro A/AAAA) para o IP público da VM — **só é necessário a partir do passo 8**. Os passos 1–7 (usuário admin, SSH, provisionamento, banco, backend/simulador, seed) rodam inteiramente sem domínio — é assim que a Fase 13.7 foi executada na prática: VPS pronta primeiro, domínio comprado depois. Ver "Comprar o domínio e apontar o DNS" mais abaixo se você ainda não tem um.

## Passo a passo

### 1. Criar o usuário administrativo com sudo

A VPS chega só com acesso `root`. Antes de qualquer outra coisa, crie um usuário administrativo e **teste o login dele numa sessão separada** antes de prosseguir — nunca prossiga sem confirmar que funciona:

```bash
ssh root@<ip-da-vm>
adduser --disabled-password --gecos '' <usuario>
usermod -aG sudo <usuario>
mkdir -p /home/<usuario>/.ssh
cp /root/.ssh/authorized_keys /home/<usuario>/.ssh/authorized_keys
chown -R <usuario>:<usuario> /home/<usuario>/.ssh
chmod 700 /home/<usuario>/.ssh && chmod 600 /home/<usuario>/.ssh/authorized_keys
```

Em outro terminal, **sem fechar a sessão root**: `ssh <usuario>@<ip-da-vm>` e `sudo whoami` — deve responder `root` sem pedir senha (ou pedindo, se você preferiu não usar `NOPASSWD`). Só depois disso siga para o próximo passo.

### 2. Endurecer o SSH

Imagens de VPS costumam trazer mais de um arquivo em `/etc/ssh/sshd_config.d/` — o OpenSSH usa o **primeiro** valor encontrado por diretiva (não o último), então um arquivo de provisionamento do provedor pode silenciosamente vencer o seu. Confira antes:

```bash
sudo sshd -T | grep -E "passwordauthentication|permitrootlogin"
```

Se `passwordauthentication` estiver `yes` mesmo com algum arquivo dizendo `no`, é exatamente esse conflito — resolva com um único arquivo novo, ordenado para vencer (prefixo numérico alto):

```bash
sudo tee /etc/ssh/sshd_config.d/90-lumitrack-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
sudo sshd -t   # valida sintaxe antes de aplicar
sudo systemctl reload ssh   # em Ubuntu 24.04 a unit é "ssh", não "sshd"
```

Reconfirme numa sessão **nova** (`ssh <usuario>@<ip-da-vm>`) antes de encerrar a sessão root. Depois disso, `ssh root@<ip-da-vm>` deve ser recusado (`Permission denied (publickey)`).

### 3. Provisionar o runtime da VM

```bash
scp deploy/provision-vm.sh <usuario>@<ip-da-vm>:~
ssh <usuario>@<ip-da-vm>
sudo ./provision-vm.sh
```

Instala Docker Engine + Compose plugin (pula se o provedor já entregou a VM com Docker pré-instalado — confira com `docker --version` antes), `age` (cifra do backup), `unattended-upgrades`, cria um swapfile de 2 GB, cria o usuário de serviço `lumitrack` (sem shell interativo — só roda os containers, não é o mesmo usuário administrativo do passo 1) e configura o `ufw` (só 22/80/443 liberados).

### 4. Clonar o repositório

```bash
sudo mkdir -p /opt/lumitrack && sudo chown lumitrack:lumitrack /opt/lumitrack
sudo -u lumitrack git clone https://github.com/<owner>/lumitrack.git /opt/lumitrack
cd /opt/lumitrack
```

Repositório público — HTTPS sem credencial.

### 5. Configurar as variáveis de ambiente

**O que este passo faz:** cada um dos três programas que rodam na VPS (backend, simulador de medidores, e a configuração geral do Docker Compose) lê suas próprias configurações de um arquivo `.env` — texto simples, uma linha `CHAVE=valor` por configuração. O repositório traz só o "molde" de cada um (`*.env.example`, com nomes de variável mas sem valor real, versionado no Git) — você copia o molde e preenche os valores de verdade, que **nunca** vão para o Git.

```bash
sudo -u lumitrack cp backend/.env.example backend/.env
sudo -u lumitrack cp iot-simulator/server/.env.example iot-simulator/server/.env
sudo -u lumitrack cp deploy/.env.example deploy/.env
sudo -u lumitrack cp frontend/.env.example frontend/.env

# Fecha a permissão ANTES de gravar qualquer segredo nos arquivos.
sudo -u lumitrack chmod 600 backend/.env iot-simulator/server/.env deploy/.env frontend/.env
```

**Por que o `chmod 600` é parte do passo, e não um detalhe:** os `.env.example` são versionados com permissão de leitura para todos (é o certo — não têm segredo nenhum), e o `cp` propaga essa permissão para o destino. Nas linhas seguintes esses mesmos arquivos passam a conter o `JWT_SECRET`, as cinco chaves de criptografia e as duas senhas do Postgres. Sem fechar a permissão, qualquer usuário da máquina consegue lê-los. `600` significa "só o dono lê e escreve" — e por isso o bloco de auditoria do `SEGURANCA-VPS.md` exige `-rw-------` em todos os quatro.

Por que `sudo -u lumitrack` na frente de cada comando: os arquivos precisam pertencer ao usuário `lumitrack` (o usuário de serviço sem shell interativo criado pelo `provision-vm.sh` no passo 3, que é quem de fato roda os containers) — não ao seu usuário administrativo (`<usuario>`, passo 1). `sudo -u lumitrack <comando>` executa aquele comando "como se fosse" o usuário `lumitrack`, sem trocar de sessão SSH.

**Por que gerar os segredos direto na VPS, e não no seu computador:** um segredo (senha, chave de criptografia, token) só é seguro se **só existir onde precisa existir**. Se você gerasse a chave no seu notebook e depois colasse no terminal SSH, ela passaria pela sua área de transferência, pelo histórico do terminal, talvez por um gerenciador de senhas — cada lugar extra é um lugar a mais que pode vazar. Gerando com um comando que roda **dentro** da própria VPS e grava direto no arquivo, o valor nunca aparece em lugar nenhum fora dali (nem na tela do Claude Code, que só vê o comando, nunca o valor gerado).

**As três ferramentas usadas para gerar segredo, e por que cada uma:**

- `openssl rand -hex 32` — gera 32 bytes aleatórios (256 bits) e mostra em hexadecimal. Usado para as chaves de criptografia simétrica (AES-256) e senhas de banco — o tamanho (32 bytes) é exatamente o que o algoritmo AES-256 exige.
- `openssl rand -hex 48` — mesma ideia, só que maior (384 bits), para o `JWT_SECRET` (assina o token de sessão — quanto maior, mais caro é forçar por tentativa e erro).
- `age-keygen` — ferramenta específica para gerar um **par de chaves assimétricas** (uma pública, uma privada) usado só para cifrar backup — ver passo 6, é diferente das chaves acima porque aqui uma chave cifra e a outra, diferente, decifra.

**O que cada segredo protege — preencha um de cada vez, conferindo o resultado:**

```bash
cd /opt/lumitrack

# JWT_SECRET — assina o token de sessão (prova de "este usuário já fez login"
# sem o backend precisar guardar sessão em memória). Se vazar, qualquer um
# forja um login válido para qualquer conta.
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=\"$(openssl rand -hex 48)\"|" backend/.env

# As 5 chaves abaixo cifram (AES-256-GCM) categorias diferentes de dado
# pessoal em repouso no banco — CADA UMA precisa ser diferente das outras.
# Se duas fossem iguais, o comprometimento de uma exporia a outra junto
# (é o motivo de existirem 5 em vez de 1 só: isolar o dano).
sed -i "s|^CPF_CNPJ_ENCRYPTION_KEY=.*|CPF_CNPJ_ENCRYPTION_KEY=\"$(openssl rand -hex 32)\"|" backend/.env
sed -i "s|^CPF_CNPJ_BLIND_INDEX_KEY=.*|CPF_CNPJ_BLIND_INDEX_KEY=\"$(openssl rand -hex 32)\"|" backend/.env
sed -i "s|^MFA_SECRET_ENCRYPTION_KEY=.*|MFA_SECRET_ENCRYPTION_KEY=\"$(openssl rand -hex 32)\"|" backend/.env
sed -i "s|^ADDRESS_ENCRYPTION_KEY=.*|ADDRESS_ENCRYPTION_KEY=\"$(openssl rand -hex 32)\"|" backend/.env
sed -i "s|^METER_CREDENTIAL_ENCRYPTION_KEY=.*|METER_CREDENTIAL_ENCRYPTION_KEY=\"$(openssl rand -hex 32)\"|" backend/.env

# Senha do usuário ADMINISTRATIVO do Postgres — só usado para migração
# (passo 7) e para criar o usuário de runtime abaixo. Se vazar, quem tiver
# essa senha consegue criar/apagar tabelas — por isso o backend, no dia a
# dia, NUNCA usa este usuário (ver LUMITRACK_APP_PASSWORD a seguir).
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=\"$(openssl rand -hex 32)\"|" deploy/.env

# Senha do usuário de RUNTIME do Postgres (lumitrack_app) — o que o
# backend usa em produção, dia a dia. Este usuário só tem permissão de
# ler/escrever linhas (DML) — NUNCA criar/apagar tabela (DDL). Mesmo que
# essa senha vaze, o estrago máximo é em dado, nunca em estrutura do banco
# (defesa em profundidade, OWASP A04 — ver verificação no passo 7).
sed -i "s|^LUMITRACK_APP_PASSWORD=.*|LUMITRACK_APP_PASSWORD=\"$(openssl rand -hex 32)\"|" deploy/.env

# Credenciais que o simulador de medidores usa para publicar leitura no
# broker MQTT interno, e o token que o script de seed usa para criar os
# devices via API do simulador — as três precisam bater nos dois arquivos
# (backend nunca usa estas; só simulador e o script do passo 7).
sed -i "s|^SIMULATOR_API_TOKEN=.*|SIMULATOR_API_TOKEN=\"$(openssl rand -hex 32)\"|" iot-simulator/server/.env
sed -i "s|^BROKER_USERNAME=.*|BROKER_USERNAME=\"$(openssl rand -hex 16)\"|" iot-simulator/server/.env
sed -i "s|^BROKER_PASSWORD=.*|BROKER_PASSWORD=\"$(openssl rand -hex 32)\"|" iot-simulator/server/.env
```

Confira que nenhum `sed` silenciosamente "não bateu" com nada (o que deixaria a variável com o valor de exemplo do `.env.example`, inseguro):

```bash
grep -E "^(JWT_SECRET|CPF_CNPJ_ENCRYPTION_KEY|CPF_CNPJ_BLIND_INDEX_KEY|MFA_SECRET_ENCRYPTION_KEY|ADDRESS_ENCRYPTION_KEY|METER_CREDENTIAL_ENCRYPTION_KEY)=" backend/.env
grep -E "^(POSTGRES_PASSWORD|LUMITRACK_APP_PASSWORD)=" deploy/.env
grep -E "^(SIMULATOR_API_TOKEN|BROKER_USERNAME|BROKER_PASSWORD)=" iot-simulator/server/.env
```

Cada linha deve mostrar uma string longa e aleatória — nunca vazia, nunca igual ao que aparecia no `.env.example`.

**As demais variáveis não são segredo — são configuração, e o valor certo depende do estado do seu domínio:**

- `IOT_ALLOWED_HOSTS=localhost` em `backend/.env` — a lista de hosts que o backend tem permissão de contatar como cliente de saída (proteção contra SSRF, OWASP A10 — o backend nunca deve poder ser instruído a bater em endereço arbitrário). Como o simulador roda dentro do mesmo namespace de rede do backend (ver "Topologia" acima), o único host que precisa estar liberado é o loopback — mas escreva `localhost` por extenso, **não** `127.0.0.1/32`: dentro do container, "localhost" resolve tanto para IPv4 (`127.0.0.1`) quanto para IPv6 (`::1`), e um CIDR só de IPv4 deixaria a metade IPv6 bloqueada — foi exatamente esse bug que apareceu na primeira execução real desta VPS (medidor caía por SSRF mesmo com tudo "certo" no IPv4).
- `DEMO_LOGIN_ENABLED=true` em `backend/.env` — liga a rota `POST /api/auth/demo-login` no backend (os botões "entrar com conta de demonstração"). Sem isso `true`, a rota responde 404/403 mesmo que o frontend mostre o botão.
- `REGISTRATION_ENABLED=false` em `backend/.env` — mantém o cadastro de novos usuários fechado. É a premissa que sustenta toda a análise de conformidade LGPD deste ambiente de demonstração (`09-conformidade-legal.md`) — **não mude para `true`** sem reler aquele documento primeiro.
- `DEMO_BOOTSTRAP_ENABLED=false` em `iot-simulator/server/.env` — aqui o simulador não hiberna como no Render, então os 11 devices são criados **uma vez só**, manualmente, pelo script do passo 7 — não a cada boot.
- **Frontend — `VITE_DEMO_MODE=true` em `frontend/.env`:** controla se os botões de login de demonstração **aparecem na tela**, e é uma variável diferente das de cima em um jeito importante: ela é lida em **tempo de build**, não em tempo de execução. O Vite (a ferramenta que empacota o frontend) troca `import.meta.env.VITE_DEMO_MODE` pelo valor literal `"true"` ou `"false"` dentro do JavaScript já compilado — depois de rodar `npm run build` (passo 7), mudar o `.env` **não tem efeito nenhum** até você buildar de novo. É por isso que este arquivo precisa existir e estar correto **antes** do build do passo 7, diferente dos `.env` do backend/simulador, que são lidos toda vez que o container inicia.
- `VITE_PRIVACY_CONTACT_EMAIL` em `frontend/.env` — endereço mostrado na Política de Privacidade e no rodapé como canal de contato do titular de dados (LGPD Art. 18). Pode ser um placeholder enquanto o projeto for só portfólio (ex.: `privacidade@<seu-dominio-real>`) — troque por um e-mail de fato monitorado antes de qualquer uso com titular real.
- `DOMAIN` (`deploy/.env`) e `CORS_ORIGIN`/`FRONTEND_URL`/`PUBLIC_API_ORIGIN` (`backend/.env`) — só precisam do valor **real** a partir do passo 8. Se você ainda não comprou o domínio, deixe qualquer placeholder plausível por enquanto (ex.: `https://lumitrack.com.br`) — os passos 1 a 7 não dependem disso. Ver o checklist completo de todas as variáveis mais abaixo, "Checklist de `.env` de produção".

### 6. Chave de cifra do backup (fora da VPS)

```bash
age-keygen -o backup-key.txt   # roda na SUA máquina, NUNCA na VPS
```

Copie a linha `Public key: age1...` para `BACKUP_ENCRYPTION_PUBLIC_KEY` em `deploy/.env` da VPS. Guarde `backup-key.txt` (a privada) num local **estável e definitivo** fora do repositório — não uma pasta solta que pode ser movida ou apagada por engano; sem ela, os backups são irrecuperáveis, inclusive por você.

### 7. Banco de dados, build do frontend e subir a aplicação

Este é o passo mais longo — cinco tarefas em sequência: preparar o banco, migrar o schema, buildar o frontend, subir backend/simulador, e popular os dados de demonstração. A ordem importa em cada uma delas; os comentários explicam por quê.

**7.1 — Subir só o banco, e aplicar a migração.**

```bash
docker compose up -d postgres
```

`docker compose up -d <serviço>` cria (se não existir) e liga o container daquele serviço, em segundo plano (`-d` = *detached*, não prende seu terminal). No primeiro boot com um volume de dados vazio, o Postgres executa automaticamente `deploy/create-app-role.sql` (configurado em `docker-compose.yml`) — isso cria o usuário `lumitrack_app`, o de **runtime**, com permissão só de ler/escrever linhas, nunca de criar/apagar tabela.

A migração (criar as tabelas em si, a partir do schema do Prisma) é uma operação diferente e **precisa do usuário administrativo** (`POSTGRES_USER`/`POSTGRES_PASSWORD` de `deploy/.env`) — de propósito, o `DATABASE_URL` que o backend usa no dia a dia (`lumitrack_app`) não tem permissão de criar tabela, então não serve para este comando:

```bash
set -a && source deploy/.env && set +a
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public" \
  docker compose run --rm --user root -e DATABASE_URL backend npm run db:migrate:deploy
```

O que cada parte faz: `source deploy/.env` carrega as variáveis daquele arquivo na sessão do seu terminal (só temporariamente, só nesta sessão SSH), para poder usá-las no comando seguinte. `docker compose run --rm` sobe um container **novo e temporário** do serviço `backend` (diferente de `up`, que sobe o container permanente) só para rodar esse um comando e depois se apagar sozinho (`--rm`). `--user root`: por padrão o container do backend roda como o usuário `node`, sem privilégio (boa prática de segurança — se alguém explorasse uma falha no backend, não ganharia root dentro do container) — mas o Prisma baixa, na hora, um executável (`schema-engine`) para aplicar a migração, e esse download precisa gravar em `node_modules/@prisma/engines`, uma pasta que o usuário `node` não tem permissão de escrita. `--user root` é uma exceção **só para este comando pontual** — o serviço `backend` de verdade (o que fica rodando 24h) continua sem privilégio, nada muda nisso.

**Por que a senha vai numa variável antes do comando, e não dentro dele:** `-e DATABASE_URL` (só o nome, sem `=valor`) manda o Docker repassar a variável que já existe no ambiente do shell. Escrever `-e DATABASE_URL="postgresql://usuario:senha@..."` colocaria a senha administrativa do banco na **linha de comando do processo**, que qualquer usuário da máquina lê com um simples `ps aux` — e ela ainda ficaria no histórico do shell. É a mesma regra de ouro do passo 5: segredo não passa por lugar nenhum além do arquivo onde precisa estar.

**Verificação (o comando abaixo TEM que falhar — se funcionar, algo está errado):**

```bash
docker compose exec postgres psql -U lumitrack_app -d "$POSTGRES_DB" -c 'CREATE TABLE regression_check (x int);'
# esperado: ERROR: permission denied for schema public
```

Essa mensagem de erro é o resultado *correto* — confirma que o usuário de runtime realmente não consegue alterar a estrutura do banco, mesmo que o backend inteiro seja comprometido por alguma falha futura.

**7.2 — Buildar o frontend.**

O frontend é um site estático (HTML/CSS/JS puro depois de compilado) — não roda como container próprio, o Caddy só serve os arquivos direto de uma pasta (`frontend/dist`). Como a VPS não tem Node.js instalado no sistema (só dentro dos containers), o build roda dentro de um container Node **descartável**, criado só para essa tarefa:

```bash
docker run --rm -v "$(pwd)/frontend:/app" -w /app node:24-slim sh -c "npm ci && npm run build"
sudo chown -R lumitrack:lumitrack frontend/dist
```

`-v "$(pwd)/frontend:/app"` monta a pasta `frontend/` do host dentro do container em `/app` — é assim que o resultado do build (`frontend/dist/`) aparece de volta no host depois que o container se apaga. `npm ci` instala as dependências exatas travadas em `package-lock.json` (mais rápido e mais previsível que `npm install` para isso). `npm run build` lê o `frontend/.env` que você preparou no passo 5 (**é aqui que `VITE_DEMO_MODE` e `VITE_PRIVACY_CONTACT_EMAIL` são gravados dentro do JavaScript compilado** — se `frontend/.env` não existisse ou estivesse com `VITE_DEMO_MODE=false` neste momento, os botões de login de demonstração simplesmente não existiriam no HTML final, mesmo com tudo certo no backend; a única forma de corrigir depois seria rodar este build de novo). A última linha corrige o dono dos arquivos gerados — o container rodou como `root` por padrão, e o Caddy (passo 8) precisa que `lumitrack` consiga ler esses arquivos.

**7.3 — Subir backend e simulador juntos.**

```bash
docker compose up -d backend simulator
docker compose ps   # os quatro (postgres, backend, simulator + o que já estava) "healthy"
docker compose exec backend node -e "require('http').get('http://localhost:3333/health',(r)=>process.exit(r.statusCode===200?0:1))"
```

Por que **sem** o Caddy ainda: o Caddy, ao subir, tenta imediatamente obter um certificado TLS (Let's Encrypt) para o `DOMAIN` configurado — se o domínio ainda não existir ou não estiver apontando para esta VPS, essa tentativa falha repetidamente e, em excesso, pode esbarrar no limite de tentativas do Let's Encrypt (rate limit, que fica bloqueado por horas). Se você já tem domínio configurado, pode pular direto para o passo 8 depois desta etapa.

> **Atenção — este é o ponto mais frágil de todo o processo, vale ler com calma.** O `simulator` está configurado (`docker-compose.yml`, `network_mode: "service:backend"`) para **compartilhar a rede interna do container `backend`**, em vez de ter a sua própria — é assim que o backend consegue falar com o broker MQTT do simulador em `localhost:1883` como se fosse parte de si mesmo, sem expor essa porta para fora. Essa amarração é decidida no exato instante em que o `simulator` liga, e trava até ele ligar de novo — **isso inclui até um `docker compose restart backend` sozinho**, sem `--force-recreate`: confirmado na prática, um restart comum do backend já é suficiente para o simulador ficar "conversando sozinho" com uma versão antiga da rede, mesmo que os dois containers continuem de pé e aparentemente saudáveis.
>
> **A regra prática, sem exceção: sempre que precisar reiniciar o `backend` por qualquer motivo (reler `.env`, aplicar mudança, o que for), reinicie o `simulator` JUNTO, no mesmo comando — nunca um separado do outro:**
>
> ```bash
> docker compose up -d --force-recreate backend simulator
> ```
>
> Reiniciar o `simulator` sempre apaga a lista de medidores dele (fica só em memória, de propósito — não é um bug) — depois deste comando, **sempre** rode de novo o script do passo 7.5 (`seed-simulator-devices.sh`) para recriá-los.

**7.4 — Popular o catálogo e os dados de demonstração.**

```bash
docker compose exec --user root backend npm run db:seed
docker compose exec --user root backend npm run db:seed:demo
```

Nesta ordem exata: `db:seed` cria o catálogo de distribuidoras de energia (referência que a demo usa); `db:seed:demo` cria as contas de demonstração, a topologia de 11 medidores e os alertas — e depende do catálogo já existir. `--user root` pelo mesmo motivo do passo 7.1 (o `tsx` que executa esses scripts precisa resolver caminhos dentro de `node_modules`).

**7.5 — Criar e ligar os 11 medidores simulados.**

```bash
./deploy/seed-simulator-devices.sh
```

Este script fala com a API de controle do simulador (não com o banco) e cria, um por um, os 11 dispositivos que a topologia de demonstração espera (6 residenciais + 5 comerciais/industriais — os nomes e tópicos exatos vêm de `iot-simulator/server/src/simulation/demoBootstrap.ts`), já ligados e publicando leitura a cada segundo.

**7.6 — Fazer o backend "descobrir" os medidores recém-criados.**

A conexão MQTT de cada medidor só é estabelecida **uma vez, no boot do processo** (não existe reconexão automática em segundo plano neste código) — então o backend, que já estava rodando desde o passo 7.3, não sabe que esses 11 medidores agora existem. Ele precisa reiniciar para "descobri-los" de novo — e, pela mesma regra do aviso acima, **nunca sozinho**:

```bash
docker compose up -d --force-recreate backend simulator
```

Sim — isso apaga de novo a lista de devices do simulador que você acabou de criar no passo 7.5. É por isso que a ordem correta, sem ciclo infinito, é: **(a)** subir backend+simulator juntos pela primeira vez (7.3) → **(b)** popular banco e criar devices (7.4, 7.5) → **(c)** subir backend+simulator juntos **de novo**, uma segunda vez (este passo) → **(d)** rodar `seed-simulator-devices.sh` **de novo**, agora pela última vez:

```bash
./deploy/seed-simulator-devices.sh
docker compose logs --tail=20 backend   # confirme "[Boot] Conexões restauradas: 11 ok, 0 falha(s)."
```

Depois disso, não toque mais em `backend`/`simulator` até o passo 8 (e, mesmo lá, sempre os dois juntos). Confirme que as leituras estão realmente sendo gravadas (aguarde ~1 min — o `MinuteRollupScheduler` agrega por minuto antes de persistir):

```bash
docker compose exec -T postgres psql -U lumitrack_app -d "$POSTGRES_DB" -c "SELECT count(*) FROM meter_readings;"
```

O número deve estar crescendo a cada vez que você roda esse comando de novo — é a prova de que a cadeia inteira (simulador → MQTT → backend → banco) está fechada e funcionando.

### 8. Domínio, TLS e o resto do stack

Só a partir daqui o domínio é necessário — ver "Comprar o domínio e apontar o DNS" abaixo se ainda não tiver um. Com o DNS já resolvendo para o IP da VPS (confirme com `dig +short <seu-dominio-real>` antes de continuar — se não voltar o IP da VPS, espere mais, não adianta seguir):

```bash
sed -i "s|^DOMAIN=.*|DOMAIN=<seu-dominio-real>|" deploy/.env
sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://<seu-dominio-real>|" backend/.env
sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://<seu-dominio-real>|" backend/.env
sed -i "s|^PUBLIC_API_ORIGIN=.*|PUBLIC_API_ORIGIN=https://<seu-dominio-real>|" backend/.env
docker compose up -d --force-recreate backend simulator   # backend precisa reler o .env; recria o simulador junto (ver aviso do passo 7) — rode seed-simulator-devices.sh de novo depois
./deploy/seed-simulator-devices.sh
docker compose --env-file deploy/.env up -d caddy
docker compose ps
```

**Sobre o `--env-file deploy/.env` na última linha — não é opcional, e não é o mesmo mecanismo do `env_file:` de dentro do `docker-compose.yml`:** o Caddy precisa saber o domínio para pedir o certificado (`environment: DOMAIN: ${DOMAIN}` no `docker-compose.yml`), mas essa substituição de `${DOMAIN}` é feita pelo **próprio comando `docker compose`** ao ler o arquivo, antes de qualquer container existir — e por padrão ele só procura um `.env` na raiz do projeto (que não existe aqui, de propósito, para não duplicar segredo). `--env-file deploy/.env` diz explicitamente onde procurar esse valor para essa substituição. Sem essa flag, o Caddy sobe com domínio "vazio" e o certificado nunca é emitido — sem nenhum erro óbvio na hora, só logs de TLS falhando depois.

Confirme que o certificado saiu e o site responde, de fora da VPS (do seu próprio computador):

```bash
curl -I https://<seu-dominio-real>/       # esperado: HTTP/2 200
curl -I http://<seu-dominio-real>/        # esperado: 301/308, redirecionando pra https
```

Se o `curl -I https://` travar ou der erro de certificado, veja os logs do Caddy: `docker compose logs -f caddy` — normalmente mostra exatamente em qual etapa do processo ACME (o protocolo que fala com o Let's Encrypt) ele está parado.

### 9. Backup automático

```bash
sudo cp deploy/lumitrack-backup.service deploy/lumitrack-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lumitrack-backup.timer
```

Rode um backup manual para validar antes de confiar no agendamento: `sudo -u lumitrack ./deploy/backup-postgres.sh`. Teste a restauração pelo menos uma vez (procedimento abaixo, "Backup e restauração testada") e registre em `deploy/BACKUP-RESTORE-LOG.md`.

### 10. Observabilidade

```bash
docker compose up -d uptime-kuma
```

O Uptime Kuma verifica de tempos em tempos se a aplicação ainda responde, e avisa quando ela para. O painel dele **não é publicado na internet** — escuta apenas no endereço interno da própria máquina, e o acesso é por túnel SSH. Abra o túnel a partir do **seu** computador:

```bash
ssh -f -N -L 3001:localhost:3001 <usuario>@<ip-da-vm>
```

`-L 3001:localhost:3001` faz a porta 3001 do seu computador desembocar na porta 3001 da VPS, através da conexão SSH já autenticada. `-f -N` manda o túnel para segundo plano sem abrir sessão de terminal. Agora `http://localhost:3001` no seu navegador mostra o painel remoto — sem nada exposto publicamente. Para fechar depois: `pkill -f "ssh -f -N -L 3001"`.

**Primeiro acesso — criar a conta.** A tela inicial pede para criar o usuário administrador. Escolha uma senha forte e guarde no gerenciador de senhas: este painel não tem provedor de e-mail configurado, então **não existe "esqueci minha senha"**. Perder o acesso significa apagar o volume (`kuma_data`) e recomeçar.

**Criar o monitor** — "Add New Monitor", com estes valores:

| Campo | Valor | Por quê |
|---|---|---|
| Monitor Type | `HTTP(s)` | Faz uma requisição HTTP real, não um ping de rede |
| Friendly Name | `LumiTrack — backend` | Nome que identifica o alerta |
| URL | `http://backend:3333/health` | Ver abaixo |
| Heartbeat Interval | `60` segundos | Detecta queda em até um minuto, sem gerar carga |
| Retries | `3` | Evita alarme falso por uma falha isolada de rede |

**Por que o endereço interno e não o domínio público:** `http://backend:3333/health` alcança o backend diretamente pela rede interna do Docker, sem passar pelo Caddy nem pelo DNS. Monitorar o domínio público diria apenas "algo quebrou" — poderia ser o backend, o proxy, o certificado ou o DNS. Monitorando o backend direto, um alerta significa exatamente uma coisa: **a aplicação parou**. (Esse endereço funciona por causa da isenção de `/health` na checagem de host canônico em `backend/src/app.ts` — o monitor chega com `Host: backend:3333`, que a proteção contra `Host` forjado rejeitaria sem a isenção.)

> **Um monitor sem canal de notificação é um painel que ninguém olha.** O Kuma registra o histórico de disponibilidade, mas só avisa se você configurar uma notificação em "Settings → Notifications" — a ADR-0009 sugere Telegram (gratuito, chega no celular). **Estado atual desta instalação: monitor ativo, notificação ainda não configurada** — a detecção funciona, o aviso não. Enquanto isso não for feito, a descoberta de uma queda continua dependendo de alguém abrir o painel.

Ver [ADR-0009](adr/0009-observabilidade-uptime-kuma-autohospedado.md) para a limitação estrutural aceita: como o Kuma roda na mesma máquina que monitora, **ele não detecta a VM inteira fora do ar** — se ela cair, o monitor cai junto e nenhum alerta sai. É um risco assumido, não um esquecimento.

### 11. Verificação ponta a ponta

- [ ] Login com conta de demonstração funciona (`POST /api/auth/demo-login`).
- [ ] O painel mostra potência ao vivo nos 11 medidores, via SSE.
- [ ] Provocar uma anomalia num device do simulador dispara alerta e notificação.
- [ ] Nenhuma conexão de saída bloqueada pelo guard de SSRF.
- [ ] `psql` a partir de fora da VM é recusado.
- [ ] Certificado TLS válido, `http://` redireciona para `https://`.
- [ ] `Host` forjado (`curl -H "Host: evil.example.com" https://<seu-dominio-real>/...`) não chega a processar nada. **Atenção ao status esperado:** atrás do Caddy, quem barra primeiro é o próprio Caddy, não o backend — a resposta observada é `200` com corpo **vazio** (nenhum header de aplicação, `content-length: 0`), porque o Caddyfile só tem uma rota, para o host configurado em `DOMAIN`; um `Host` diferente não bate com rota nenhuma e o Caddy nunca chega a repassar a requisição para o backend. A checagem própria do backend (`shared/security/httpsRedirect.ts`, que responderia 400) existe como segunda camada, mas nesta topologia o Caddy sempre intercepta antes — o importante é confirmar que **nenhum dado da aplicação é devolvido**, não o código de status exato.
- [ ] **Documentos legais refletem os dois ambientes que existem de fato:** `frontend/src/legal/privacy-policy.md` § 4 distingue produção (Brasil, sem operador) de staging (Render+Neon, EUA, exposição limitada aos registros de acesso) — não declara mais "exclusivamente no Brasil" para o produto inteiro, porque o staging continua existindo. Mesma lógica em `.claude/docs/ROPA.md` (tabela de operadores rotulada por ambiente) e `.claude/project_context/09-conformidade-legal.md`. Se `CURRENT_CONSENT_VERSION` (`backend/src/shared/legal/consentVersion.ts`) mudar, precisa estar **em sincronia** com a versão declarada no cabeçalho da Política — se divergirem, o usuário aceita um texto e o sistema grava outro.

## Comprar o domínio e apontar o DNS

Guia para quem nunca fez isso. Numera os cliques porque cada registrador muda a UI com frequência — o que não muda é o conceito.

1. **Escolher e registrar o domínio.** Em [registro.br](https://registro.br) (para `.com.br`/`.app.br` — mais barato e mais simples para um projeto brasileiro que já processa dado exclusivamente no Brasil, em produção): crie uma conta, pesquise o nome desejado, escolha a terminação (`.com.br` é a mais reconhecida; `.app.br` é mais específico e mais barato), e finalize a compra. Leva minutos; o domínio fica ativo quase na hora.
2. **Achar o IP da VPS.** É o mesmo IP que você usa para `ssh <usuario>@<ip-da-vm>` — no hPanel da Hostinger, também aparece no painel do servidor ("IP Address"). Se a VPS tiver IPv6, ele também aparece lá (`ip -6 addr show scope global` na própria VPS mostra o endereço). Guarde os dois (v4 e v6, se houver) — vai precisar deles no próximo passo. **Trate o IP como informação sensível na prática, não só o segredo em si**: não é preciso escondê-lo de você mesmo, mas evite colar em lugar público (issue do GitHub, chat aberto) sem necessidade — é o alvo de qualquer tentativa de acesso direto à máquina.
3. **Apontar o DNS.** No painel do registro.br, entre no domínio e procure "Editar Zona"/"Modo Avançado" (o nome exato varia). Crie três registros — o campo "Nome"/"Host" fica **em branco** para o domínio raiz:
   - **A**, nome em branco, apontando para o **IPv4** da VPS.
   - **AAAA**, nome em branco, apontando para o **IPv6** da VPS, se ela tiver um — sem esse registro, visitantes com internet só-IPv6 não conseguem alcançar o site.
   - **CNAME**, nome `www`, apontando para o próprio domínio raiz (com o ponto final no fim — ex. `<seu-dominio-real>.`, é assim que se escreve "aponte para este mesmo domínio" num registro DNS) — faz `www.<seu-dominio-real>` funcionar também. O `Caddyfile` deste projeto já está preparado só para o domínio raiz (`{$DOMAIN}` sem `www`); se quiser que `https://www.<seu-dominio-real>` sirva o site (e não só redirecione), adicione `www.{$DOMAIN}` na mesma linha do bloco em `deploy/Caddyfile`.
4. **Esperar a propagação.** De minutos a algumas horas — em teoria. **Na prática, o painel do registro.br pode levar horas para publicar de fato uma alteração de zona, mesmo mostrando a mudança salva** (o número de série SOA da zona incrementa a cada salvamento, o que é o sinal de que o registro.br *aceitou* a mudança, mas isso não significa que os servidores autoritativos já estejam respondendo com o novo valor — foi exatamente o que aconteceu na primeira execução deste guia: os registros ficaram corretos na tela, o serial subiu a cada salvamento, e mesmo assim consultar os servidores autoritativos diretamente devolvia vazio por um bom tempo). Confira de duas formas, e prefira a segunda se a primeira não mostrar nada:

   ```bash
   # Direto nos servidores autoritativos do seu domínio (mais rigoroso —
   # a.auto.dns.br/b.auto.dns.br são os do registro.br; pode ainda não ter
   # propagado mesmo com tudo certo no painel)
   dig +short A <seu-dominio-real> @a.auto.dns.br
   dig +short AAAA <seu-dominio-real> @a.auto.dns.br

   # Via um resolvedor público (reflete o que a maioria dos visitantes
   # realmente vê — costuma atualizar primeiro)
   dig +short A <seu-dominio-real> @8.8.8.8
   dig +short AAAA <seu-dominio-real> @8.8.8.8
   ```

   Quando o IP retornado bater com o da VPS (em qualquer uma das duas consultas), já dá para seguir para o passo 8 — não precisa esperar as duas baterem. Se passarem várias horas sem nenhuma das duas resolver, vale abrir um chamado com o suporte do registro.br.
5. **Seguir o passo 8** desta página ("Domínio, TLS e o resto do stack") — o Caddy só consegue emitir o certificado Let's Encrypt depois que o DNS já está resolvendo (o desafio ACME HTTP-01 precisa alcançar a porta 80 da VPS através do domínio).

## Checklist de `.env` de produção — Caminho B

| Variável | Onde | Produção | Por quê |
|---|---|---|---|
| `NODE_ENV` | `backend/.env` | `production` | Liga as validações fail-closed de `config/env.ts`. |
| `DATABASE_URL` | `backend/.env` | `postgresql://lumitrack_app:<LUMITRACK_APP_PASSWORD>@postgres:5432/<POSTGRES_DB>?schema=public` | Host é `postgres` (nome do serviço no compose), nunca `localhost`. Usuário `lumitrack_app` (sem DDL, criado automaticamente por `deploy/create-app-role.sql` no primeiro boot) — **não** `POSTGRES_USER`, que fica só para migração (passo 7). Senha deve bater com `LUMITRACK_APP_PASSWORD` de `deploy/.env`. |
| `JWT_SECRET` | `backend/.env` | Novo valor gerado | Gate de go-live #7. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `CPF_CNPJ_ENCRYPTION_KEY`, `CPF_CNPJ_BLIND_INDEX_KEY`, `MFA_SECRET_ENCRYPTION_KEY`, `ADDRESS_ENCRYPTION_KEY`, `METER_CREDENTIAL_ENCRYPTION_KEY` | `backend/.env` | 5 valores novos, todos distintos | Gate de go-live #7. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — nunca reaproveitar a mesma chave entre categorias de dado. |
| `CORS_ORIGIN` | `backend/.env` | `https://<seu-dominio>` | Nunca `*` em produção. |
| `PUBLIC_API_ORIGIN` | `backend/.env` | `https://<seu-dominio>` | Gate de go-live #5 — host canônico do redirect HTTPS e da checagem de `Host` forjado. |
| `FRONTEND_URL` | `backend/.env` | `https://<seu-dominio>` | Compõe o link de e-mails transacionais. |
| `REGISTRATION_ENABLED` | `backend/.env` | `false` enquanto for demonstração | Default do código é `true`. Ao abrir para usuários reais, este caminho é o pré-requisito. |
| `DEMO_LOGIN_ENABLED` | `backend/.env` | `true` | Mantém o botão de demo funcional com o cadastro fechado. |
| `IOT_ALLOWED_HOSTS` | `backend/.env` | `localhost` | O simulador compartilha o namespace de rede do container `backend` — o broker está em loopback, e os medidores de demo apontam pro host `"localhost"` (não IP literal). **Não** `127.0.0.1/32` sozinho: "localhost" resolve IPv4 e IPv6 (`::1`) dentro do container, um CIDR só de IPv4 deixa o `::1` de fora e a checagem SSRF nega a conexão (achado da Fase 13.7 — confirmado em produção real). |
| `SMTP_*` | `backend/.env` | Sandbox, salvo se contratar provedor | Sem provedor, "esqueci minha senha" não é funcional. Contratar um cria um **operador** (DPA no ROPA). |
| `SIMULATOR_API_TOKEN`, `BROKER_USERNAME`, `BROKER_PASSWORD` | `iot-simulator/server/.env` | Valores novos gerados | Devem bater com `SIMULATOR_BROKER_USERNAME`/`SIMULATOR_BROKER_PASSWORD` do `db:seed:demo`. |
| `DEMO_BOOTSTRAP_ENABLED` | `iot-simulator/server/.env` | `false` | Aqui o serviço não hiberna; os devices são criados uma vez por `deploy/seed-simulator-devices.sh`. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `deploy/.env` | Valores novos gerados | Usuário administrativo — só para migração (passo 7), nunca para `DATABASE_URL` do backend. |
| `LUMITRACK_APP_PASSWORD` | `deploy/.env` | Valor novo gerado, distinto de `POSTGRES_PASSWORD` | Senha do papel de runtime sem DDL. Deve bater com o `DATABASE_URL` acima. |
| `DOMAIN` | `deploy/.env` | Domínio real | Repassado ao Caddy para o certificado Let's Encrypt. **Lido pelo próprio `docker compose` para substituir `${DOMAIN}` no `docker-compose.yml`** — por isso os comandos que sobem o Caddy no passo 8 precisam da flag `--env-file deploy/.env`, sem a qual o Caddy sobe sem domínio nenhum (ver explicação no passo 8). |
| `BACKUP_ENCRYPTION_PUBLIC_KEY` | `deploy/.env` | Chave pública `age1...` gerada fora da VM | `age-keygen -o backup-key.txt` **na sua máquina**, nunca na VM — guarde a chave privada fora do repositório. Ver "Backup e restauração testada" abaixo. |
| `VITE_DEMO_MODE` | `frontend/.env` | `true` | Mostra os botões de login de demonstração na tela de login. **Lido só em tempo de build** (passo 7.2, `npm run build`) — mudar este arquivo depois de já ter buildado não muda nada até você buildar de novo. |
| `VITE_PRIVACY_CONTACT_EMAIL` | `frontend/.env` | E-mail (real ou placeholder) | Mostrado na Política de Privacidade e no rodapé. Mesma observação: só tem efeito no próximo build. |

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

**Restauração testada (obrigatória ao menos uma vez — um backup nunca restaurado não é um backup — registrar em `deploy/BACKUP-RESTORE-LOG.md` a cada execução, nunca apagar entradas antigas). Roda inteira na SUA máquina, nunca na VM — a chave privada não pode chegar perto do host que ela protege:**

```bash
# 1. Trazer o dump cifrado da VM para a sua máquina (só o .age — nada de chave)
scp usuario@<ip-da-vm>:/opt/lumitrack/backups/lumitrack-<timestamp>.sql.gz.age .

# 2. Banco descartável, isolado do de produção — na sua máquina
docker run --rm -d --name lumitrack-restore-test \
    -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=restore_test -p 127.0.0.1:5433:5432 postgres:16

# 3. Decifrar (chave PRIVADA, já na sua máquina — nunca copiada para a VM) e restaurar
age -d -i backup-key.txt lumitrack-<timestamp>.sql.gz.age | \
    gunzip | \
    docker exec -i lumitrack-restore-test psql -U postgres -d restore_test

# 4. Conferir que os dados vieram (exemplo: contagem de usuários)
docker exec lumitrack-restore-test psql -U postgres -d restore_test -c 'SELECT count(*) FROM "users";'

# 5. Descartar — o container E o dump baixado (o .age já cumpriu o papel)
docker rm -f lumitrack-restore-test
rm lumitrack-<timestamp>.sql.gz.age
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

### Problemas conhecidos — Caminho B (achados reais, primeira execução)

**Os botões de login de demonstração não aparecem na tela.**

- **Causa:** `frontend/.env` não existia (ou `VITE_DEMO_MODE` não era `true`) no momento em que `npm run build` rodou no passo 7.2. Como essa variável só é lida em tempo de build (ver explicação no passo 5), o botão simplesmente não foi incluído no HTML/JS final — não é um problema de configuração do backend nem do Caddy.
- **Diagnóstico:** confirme se o texto do botão está no arquivo já publicado — `curl -s https://<seu-dominio-real>/ | grep -o 'index-[A-Za-z0-9]*\.js'` pega o nome do bundle atual, depois `curl -s https://<seu-dominio-real>/assets/<nome-do-bundle>.js | grep -c "demonstra"` — se retornar `0`, o build realmente não tem o modo demo habilitado.
- **Correção:** confira/edite `frontend/.env` (`VITE_DEMO_MODE=true`) e rode o build de novo (passo 7.2) — não precisa reiniciar nenhum container, o Caddy serve os arquivos direto da pasta `frontend/dist` e reflete a mudança assim que o build termina.

**A potência ao vivo (SSE) não atualiza, mesmo com login funcionando.**

- **Causa mais provável nesta topologia: o backend e o simulador ficaram com a rede dessincronizada** (ver o aviso detalhado no passo 7.3) — normalmente porque um dos dois foi reiniciado sem o outro em algum momento depois do deploy inicial (por exemplo, ao aplicar uma atualização só no backend).
- **Diagnóstico:** veja os logs do backend logo após ele subir: `docker compose logs backend --since 5m | grep -iE "mqtt|conectad|falha"`. Se aparecer `"Falha ao conectar"` com `ECONNREFUSED 127.0.0.1:1883` para os medidores, é exatamente isso — o backend não está mesmo enxergando o broker do simulador, apesar dos dois containers estarem "up".
- **Correção:** suba os dois juntos, no mesmo comando (nunca separado): `docker compose up -d --force-recreate backend simulator`, depois rode `./deploy/seed-simulator-devices.sh` de novo (o simulador perde a lista de medidores toda vez que reinicia). Confirme com `docker compose logs backend --tail 15 | grep Conectado` — devem aparecer 11 linhas.

**O Caddy sobe, mas o certificado nunca é emitido / o site responde sem HTTPS.**

- **Causa:** faltou `--env-file deploy/.env` no comando que sobe o Caddy — sem essa flag, `${DOMAIN}` (usado dentro do `docker-compose.yml` para configurar o Caddy) fica vazio, e o Caddy não sabe para qual domínio pedir certificado. É um mecanismo diferente do `env_file:` que aparece dentro da definição de cada serviço no `docker-compose.yml` — aquele só vale para variáveis usadas *dentro* do container; este (`--env-file`, na linha de comando) vale para as substituições `${...}` do próprio arquivo `docker-compose.yml`.
- **Diagnóstico:** `docker exec lumitrack-caddy-1 printenv DOMAIN` — se vier vazio, é isso.
- **Correção:** sempre inclua `--env-file deploy/.env` em qualquer comando `docker compose` que envolva o serviço `caddy` (o passo 8 já vem assim neste documento).
