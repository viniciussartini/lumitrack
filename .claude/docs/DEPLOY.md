# DEPLOY.md — Go-live do LumiTrack

> Fase 13.5 do roadmap (`.claude/docs/roadmap.md`), Bloco A. Fecha os gates operacionais #6 e #7 da [ADR-0008](adr/0008-hospedagem-brasil-oracle-always-free.md). Este documento é o procedimento reproduzível de deploy — se um passo daqui divergir do que o operador realmente fez, o documento está desatualizado, não o deploy.

## Topologia

Tudo numa única VM Oracle Cloud Always Free, região São Paulo (`sa-saopaulo-1`), orquestrado via Docker Compose (`docker-compose.yml` na raiz do repositório):

```text
┌──────────────────────────────────────────────────────────────────┐
│  VM Ubuntu 24.04 — Oracle Cloud Always Free, São Paulo            │
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

Ver [ADR-0008](adr/0008-hospedagem-brasil-oracle-always-free.md) para o racional completo (por que VM única, por que sem operador estrangeiro) e [ADR-0009](adr/0009-observabilidade-uptime-kuma-autohospedado.md) para a escolha do Uptime Kuma.

## Pré-requisitos

- VM Oracle Cloud Always Free criada (Ubuntu 24.04, shape Ampere A1 — ou o fallback x86 documentado na ADR-0008 se a capacidade ARM não estiver disponível em São Paulo).
- Domínio real apontando (registro A/AAAA) para o IP público da VM.
- Chave SSH configurada no provisionamento da instância (nunca senha).

## Passo a passo — deploy do zero

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

Copie e edite **cada** `.env.example` — ver o checklist completo na seção abaixo antes de prosseguir:

```bash
cp backend/.env.example backend/.env
cp iot-simulator/server/.env.example iot-simulator/server/.env
cp deploy/.env.example deploy/.env
```

### 4. Build do frontend

O frontend é servido como arquivo estático pelo Caddy (bind mount) — não tem container próprio, então o build acontece fora do compose:

```bash
cd frontend && npm ci && npm run build && cd ..
```

`frontend/dist/` precisa existir antes do `docker compose up`.

### 5. Subir o banco e aplicar as migrações

```bash
docker compose up -d postgres
docker compose run --rm backend npm run db:migrate:deploy
```

### 6. Subir o stack completo

```bash
docker compose up -d
docker compose ps # todos os serviços "healthy"/"running"
curl -I https://<seu-dominio>/ # frontend estático respondendo via Caddy
docker compose exec backend curl -sf http://localhost:3333/health # /health não é proxiado publicamente (só /api/* é) — checagem interna
```

### 7. Popular a demonstração

```bash
docker compose exec backend npm run db:seed:demo
./deploy/seed-simulator-devices.sh
```

### 8. Observabilidade

Acesse o Uptime Kuma via túnel SSH (`ssh -L 3001:localhost:3001 usuario@<ip-da-vm>`, depois `http://localhost:3001` no navegador local), crie o monitor HTTP apontando para `http://backend:3333/health` (dentro da rede do compose — o Kuma já está nela) e configure a notificação (Telegram recomendado). Ver [ADR-0009](adr/0009-observabilidade-uptime-kuma-autohospedado.md) para o racional e a limitação aceita (não detecta a VM inteira fora do ar).

### 9. Verificação ponta a ponta (critério de aceite da issue #193)

- [ ] Login com conta de demonstração funciona (`POST /api/auth/demo-login`).
- [ ] O painel mostra potência ao vivo nos 4 medidores, via SSE.
- [ ] Provocar uma anomalia num device do simulador (`POST /api/devices/:id/anomaly`) dispara um alerta e gera notificação no LumiTrack.
- [ ] Nenhuma conexão de saída bloqueada pelo guard de SSRF (`IOT_ALLOWED_HOSTS` cobre o caso legítimo — ver checklist abaixo).
- [ ] `psql` a partir de fora da VM é recusado.
- [ ] Certificado TLS válido, `http://` redireciona para `https://`, `Host` forjado recebe 400.

## Checklist de `.env` de produção (issue #191)

Todas as variáveis que **mudam de valor** entre desenvolvimento e produção — o resto do `.env.example` já serve como está.

| Variável | Onde | Produção | Por quê |
|---|---|---|---|
| `NODE_ENV` | `backend/.env` | `production` | Liga as validações fail-closed de `config/env.ts` (`CORS_ORIGIN`/`PUBLIC_API_ORIGIN` não podem ficar no default). |
| `DATABASE_URL` | `backend/.env` | `postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>?schema=public` | Host é `postgres` (nome do serviço no compose), nunca `localhost` — só funciona dentro da rede do Docker Compose. Usuário/senha devem bater com `deploy/.env`. |
| `JWT_SECRET` | `backend/.env` | Novo valor gerado | Gate de go-live #7. **Nunca** o valor de exemplo do `.env.example`. Gerar com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `CPF_CNPJ_ENCRYPTION_KEY`, `CPF_CNPJ_BLIND_INDEX_KEY`, `MFA_SECRET_ENCRYPTION_KEY`, `ADDRESS_ENCRYPTION_KEY`, `METER_CREDENTIAL_ENCRYPTION_KEY` | `backend/.env` | 5 valores novos, todos distintos entre si | Gate de go-live #7. Gerar cada um com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — nunca reaproveitar a mesma chave entre categorias de dado (compartimentalização, ver comentários do próprio `.env.example`). |
| `CORS_ORIGIN` | `backend/.env` | `https://<seu-dominio>` | Nunca `*` em produção — bloqueado por validação, mas o valor default de dev (`localhost:3000`) também quebraria o app real. |
| `PUBLIC_API_ORIGIN` | `backend/.env` | `https://<seu-dominio>` | Gate de go-live #5 — host canônico do redirect HTTPS e da checagem de `Host` forjado. |
| `FRONTEND_URL` | `backend/.env` | `https://<seu-dominio>` | Compõe o link de e-mails transacionais (mesmo que SMTP fique em sandbox na demo pública). |
| `REGISTRATION_ENABLED` | `backend/.env` | `false` | **Gate de go-live #1 — premissa de validade inteira da ADR-0008.** Default do código é `true`; subir sem trocar derruba a conclusão de conformidade no primeiro cadastro real. Maior consequência, menor esforço da fase inteira. |
| `DEMO_LOGIN_ENABLED` | `backend/.env` | `true` | Mantém o botão de demo funcional com o cadastro fechado. |
| `IOT_ALLOWED_HOSTS` | `backend/.env` | `127.0.0.1/32` | O simulador compartilha o namespace de rede do container `backend` (`network_mode: service:backend`) — do ponto de vista do backend, o broker MQTT do simulador está em loopback, exatamente como no ambiente local. Não afrouxa a proteção de SSRF da issue #150. |
| `SMTP_*` | `backend/.env` | Deixar em sandbox (valores de exemplo) | Nenhum provedor contratado (ADR-0008) — "esqueci minha senha" não é funcional na demo pública, consequência aceita. |
| `SIMULATOR_API_TOKEN`, `BROKER_USERNAME`, `BROKER_PASSWORD` | `iot-simulator/server/.env` | Valores novos gerados | Mesmo padrão de rotação — nunca os valores de exemplo. Devem bater com `SIMULATOR_BROKER_USERNAME`/`SIMULATOR_BROKER_PASSWORD` usados pelo `db:seed:demo` do backend (variável de ambiente do processo de seed, não um `.env` versionado). |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `deploy/.env` | Valores novos gerados | Devem bater com o host/credenciais dentro de `DATABASE_URL` acima. |
| `DOMAIN` | `deploy/.env` | Domínio real | Repassado ao Caddy para o certificado Let's Encrypt — precisa bater com `PUBLIC_API_ORIGIN`/`CORS_ORIGIN`/`FRONTEND_URL`. |

## Backup e restauração testada (issue #192)

**Automático:** `deploy/lumitrack-backup.timer` roda `deploy/backup-postgres.sh` diariamente (`pg_dump` comprimido, retenção de 14 dias por padrão). Instalar:

```bash
sudo cp deploy/lumitrack-backup.service deploy/lumitrack-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lumitrack-backup.timer
```

**Restauração testada (obrigatória ao menos uma vez — um backup nunca restaurado não é um backup):**

```bash
# 1. Banco descartável, isolado do de produção
docker run --rm -d --name lumitrack-restore-test \
    -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=restore_test postgres:16

# 2. Restaurar o dump mais recente
gunzip -c /opt/lumitrack/backups/lumitrack-<timestamp>.sql.gz | \
    docker exec -i lumitrack-restore-test psql -U postgres -d restore_test

# 3. Conferir que os dados vieram (exemplo: contagem de usuários)
docker exec lumitrack-restore-test psql -U postgres -d restore_test -c 'SELECT count(*) FROM "User";'

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

## Troubleshooting

```bash
docker compose ps                    # estado/healthcheck de cada serviço
docker compose logs -f backend       # logs em tempo real
docker compose logs -f caddy         # erros de TLS/proxy
docker compose exec backend sh       # shell dentro do container, se precisar depurar
```
