#!/usr/bin/env bash
# deploy/provision-vm.sh
#
# Provisionamento inicial de uma VM Ubuntu 24.04 LTS com datacenter no
# Brasil (já rodou em Oracle Cloud Always Free; hoje roda em VPS Hostinger,
# ADR-0012 — o script é genérico, não depende do provedor) para rodar o
# stack via Docker Compose. Rodar UMA VEZ, manualmente, via SSH na VM já
# criada — este script não cria a VM em si (isso é console/CLI do provedor,
# fora do repositório) nem cria o usuário administrativo com sudo (ver
# passo manual ao final — o nome do usuário é escolha do operador).
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

echo "==> Instalando age (cifra do backup, deploy/backup-postgres.sh)..."
apt-get install -y age

echo "==> Instalando e habilitando atualizações de segurança automáticas..."
apt-get install -y unattended-upgrades apt-listchanges
systemctl enable --now unattended-upgrades

echo "==> Configurando swap (rede de segurança para Postgres+Node+simulador+Caddy simultâneos)..."
if swapon --show | grep -q .; then
    echo "swap já configurado — pulando."
else
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo "/swapfile none swap sw 0 0" >>/etc/fstab
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
# qualquer um deles aqui reintroduziria exatamente o que a ADR-0008 fechou.
ufw --force enable

cat <<'EOF'

==> Provisionamento base concluído.

Passos manuais que este script NÃO automatiza (mexer em SSH remotamente
sem confirmação interativa é arriscado — ver CLAUDE.md):

1. Crie o usuário administrativo com sudo (nome à sua escolha) e copie
   para ele a chave pública já autorizada em root:
     adduser --disabled-password --gecos '' <usuario>
     usermod -aG sudo <usuario>
     mkdir -p /home/<usuario>/.ssh && cp /root/.ssh/authorized_keys /home/<usuario>/.ssh/
     chown -R <usuario>:<usuario> /home/<usuario>/.ssh && chmod 700 /home/<usuario>/.ssh
   TESTE o login com esse usuário numa sessão SSH SEPARADA antes de
   continuar — não prossiga sem confirmar que ele funciona.

2. Só depois do teste acima, desabilite senha e login root. Imagens de
   VPS costumam trazer sshd_config.d/ com mais de um arquivo — o OpenSSH
   usa o PRIMEIRO valor encontrado por diretiva, então um arquivo de
   provisionamento automático (ex.: cloud-init) processado antes do seu
   pode silenciosamente vencer. Confira com `sshd -T | grep -E
   "passwordauthentication|permitrootlogin"` antes E depois de editar.
   Escreva um único arquivo novo (ex.: /etc/ssh/sshd_config.d/90-hardening.conf)
   com:
     PasswordAuthentication no
     PermitRootLogin no
   Rode `sshd -t` (valida sintaxe) e só então `systemctl reload ssh`
   — em Ubuntu 24.04 a unit é `ssh.service`, não `sshd.service`.
   Reconfirme o acesso do usuário administrativo numa sessão NOVA antes
   de encerrar a sessão root atual.

3. `psql` a partir de fora da VM deve ser recusado — sem regra de ufw para
   5432, já é o caso; confirme com um `psql` de outra máquina depois do
   deploy.

Próximo passo: clonar o repositório e seguir .claude/docs/DEPLOY.md a partir
de "Publicação com Docker Compose".
EOF
