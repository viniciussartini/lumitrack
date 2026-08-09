#!/usr/bin/env bash
# deploy/provision-vm.sh — Fase 13.5 Bloco A, issue #188.
#
# Provisionamento inicial de uma VM Ubuntu 24.04 LTS (Oracle Cloud Always
# Free, sa-saopaulo-1 — ver ADR-0008) para rodar o stack via Docker Compose.
# Rodar UMA VEZ, manualmente, via SSH na VM já criada — este script não
# cria a VM em si (isso é console/CLI da Oracle Cloud, fora do repositório).
#
# Idempotente: pode ser rodado de novo sem duplicar regras de firewall ou
# reinstalar o que já está presente.
#
# Uso: sudo ./provision-vm.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Rode como root (sudo ./provision-vm.sh)." >&2
    exit 1
fi

echo "==> Atualizando pacotes do sistema..."
apt-get update
apt-get upgrade -y

echo "==> Instalando Docker Engine + Compose plugin (repositório oficial Docker)..."
if ! command -v docker >/dev/null 2>&1; then
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        >/etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
    echo "Docker já instalado — pulando."
fi

echo "==> Criando usuário de serviço sem privilégio (lumitrack)..."
if ! id lumitrack >/dev/null 2>&1; then
    useradd --system --create-home --shell /usr/sbin/nologin lumitrack
fi
usermod -aG docker lumitrack

echo "==> Configurando firewall (ufw)..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP (redirect + desafio ACME)"
ufw allow 443/tcp comment "HTTPS"
# Deliberadamente NENHUMA regra para 5432 (Postgres), 1883 (MQTT do
# simulador) ou 3001 (Uptime Kuma) — esses ficam só na rede interna do
# Docker Compose ou em 127.0.0.1 do host (ver docker-compose.yml). Abrir
# qualquer um deles aqui reintroduziria exatamente o que a issue #180 e a
# ADR-0008 fecharam.
ufw --force enable

cat <<'EOF'

==> Provisionamento base concluído.

Passos manuais que este script NÃO automatiza (mexer em SSH remotamente
sem confirmação interativa é arriscado — ver CLAUDE.md):

1. Em /etc/ssh/sshd_config, garanta:
     PasswordAuthentication no
     PermitRootLogin no
   e rode `systemctl restart sshd` só depois de confirmar que sua chave
   pública já autentica numa sessão SEPARADA (nunca feche a sessão atual
   antes de confirmar).

2. `psql` a partir de fora da VM deve ser recusado — sem regra de ufw para
   5432, já é o caso; confirme com um `psql` de outra máquina depois do
   deploy (critério de aceite do #188).

Próximo passo: clonar o repositório e seguir .claude/docs/DEPLOY.md a partir
de "Publicação com Docker Compose".
EOF
