# SEGURANCA-VPS.md — Endurecimento e auditoria da VPS de produção

> Companheiro do `DEPLOY.md`. Enquanto aquele documento ensina a **colocar a aplicação no ar**, este ensina a **deixar a máquina segura** e a **verificar depois se continua segura**. Escrito para quem nunca administrou um servidor.
>
> **Nenhum dado real deste projeto aparece aqui.** Todo endereço, nome de usuário e domínio é um placeholder entre `<` e `>` — troque pelos seus. O motivo está explicado na seção "Higiene de dados sensíveis num repositório público", no fim: este repositório é público, então o próprio documento precisa seguir a regra que ensina.

## Para quem é este documento

Você alugou uma VPS (um computador ligado 24h na internet, com IP público) e colocou uma aplicação nela. A partir do instante em que essa máquina ganhou um IP público, ela passou a receber tentativas de invasão automatizadas — não porque alguém escolheu você, mas porque robôs varrem a internet inteira o tempo todo procurando máquinas mal configuradas. Isso é rotina, não é um ataque pessoal, e é exatamente o que as configurações deste documento neutralizam.

Para dar uma noção concreta: nesta VPS, poucas horas depois de a porta de acesso remoto ficar pública, o registro do sistema já acumulava **mais de cem tentativas de login falhas** vindas de endereços desconhecidos. Nenhuma teve chance, porque as defesas abaixo já estavam no lugar — mas elas estavam lá porque foram configuradas de propósito, não por padrão.

## O modelo mental: camadas, não muralha

Segurança de servidor não é uma configuração que "liga" e resolve. São camadas independentes, cada uma cobrindo a falha da anterior. Se uma cede, a seguinte segura:

| Camada | Pergunta que ela responde | Onde está neste documento |
|---|---|---|
| **Acesso** | Quem consegue entrar na máquina? | Parte 1 — SSH |
| **Rede** | Quais portas o mundo enxerga? | Parte 2 — Firewall |
| **Privilégio** | Se alguém entrar, o que consegue fazer? | Parte 3 — Usuários, containers e banco |
| **Manutenção** | As falhas conhecidas estão corrigidas? | Parte 4 — Atualizações e backup |
| **Transporte** | O tráfego pode ser lido no caminho? | Parte 5 — TLS/HTTPS |

O princípio que atravessa todas elas se chama **menor privilégio**: cada usuário, processo e container recebe exatamente a permissão de que precisa para funcionar, e nada além. Assim, um comprometimento em qualquer ponto tem alcance limitado em vez de virar controle total da máquina.

---

# Parte 1 — Acesso: quem consegue entrar

## 1.1 Por que não usar o `root` no dia a dia

Toda VPS chega com um usuário chamado `root` — o administrador absoluto, que pode fazer qualquer coisa sem restrição, inclusive apagar o sistema inteiro por engano. Dois problemas em usá-lo direto:

1. **É o alvo óbvio.** Todo robô que varre a internet tenta `root` primeiro, porque esse nome existe em todo servidor Linux do mundo. Um nome de usuário que o atacante não conhece já é um obstáculo a mais.
2. **Não há rede de proteção.** Como `root`, um comando digitado errado executa sem perguntar nada.

A solução é criar um usuário comum e dar a ele a capacidade de *virar* administrador quando necessário, através do comando `sudo` (que pede confirmação e registra o que foi feito).

```bash
# Conectado como root, na primeira vez:
adduser --disabled-password --gecos '' <usuario>
usermod -aG sudo <usuario>
```

- `adduser` cria o usuário. `--disabled-password` significa "sem senha de login" — de propósito, porque o acesso vai ser por chave (item 1.2), e uma senha inexistente é uma senha que ninguém adivinha.
- `usermod -aG sudo <usuario>` coloca o usuário no grupo `sudo`, que é o que dá o direito de usar o comando `sudo`.

> **Armadilha real encontrada nesta VPS:** o `adduser` pode falhar dizendo que o grupo já existe, se a imagem do provedor já tiver criado um grupo com aquele nome. Nesse caso, reaproveite o grupo existente em vez de brigar com ele — descubra o número dele com `getent group <nome>` e passe `--gid <numero>` para o `adduser`.

Agora copie a chave de acesso que o provedor já configurou para o `root`, para que o novo usuário também consiga entrar:

```bash
mkdir -p /home/<usuario>/.ssh
cp /root/.ssh/authorized_keys /home/<usuario>/.ssh/authorized_keys
chown -R <usuario>:<usuario> /home/<usuario>/.ssh
chmod 700 /home/<usuario>/.ssh && chmod 600 /home/<usuario>/.ssh/authorized_keys
```

Os dois `chmod` no fim não são detalhe: o SSH **recusa** usar um arquivo de chaves que outros usuários da máquina consigam ler, justamente para impedir que um usuário sem privilégio roube o acesso de outro. `700` = só o dono entra na pasta; `600` = só o dono lê o arquivo.

> **Pare aqui e teste.** Abra um **segundo terminal**, sem fechar a sessão atual, e rode `ssh <usuario>@<ip-da-vm>` seguido de `sudo whoami` (deve responder `root`). Só continue depois que isso funcionar. Esse cuidado se repete no próximo passo por um motivo sério: as mudanças de SSH que vêm a seguir podem, se algo der errado, **trancar você para fora da própria máquina** — e com login por senha desativado não há como voltar pela porta da frente. Manter uma sessão antiga aberta é a corda de segurança; ela continua funcionando mesmo que a configuração nova esteja quebrada.

## 1.2 Chave em vez de senha

Uma senha é um segredo que você digita; uma chave SSH é um par de arquivos matematicamente ligados:

- A **chave pública** fica no servidor. Não é segredo — pode ser vista por qualquer um sem risco.
- A **chave privada** fica só no seu computador, e **nunca** deve ser copiada para lugar nenhum — nem para o servidor, nem para um chat, nem para a nuvem.

Para entrar, seu computador prova que possui a chave privada sem nunca revelá-la. A vantagem sobre a senha é decisiva: uma senha típica pode ser adivinhada por tentativa e erro em tempo viável; uma chave, não — o espaço de possibilidades é grande demais para força bruta.

## 1.3 Desligar as portas de entrada que sobraram

Ter chave configurada não basta se a máquina **também** continuar aceitando senha — o atacante simplesmente ignora a chave e ataca a senha. É preciso desligar explicitamente o que não se usa:

```bash
sudo tee /etc/ssh/sshd_config.d/90-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
sudo sshd -t                 # valida a sintaxe ANTES de aplicar
sudo systemctl reload ssh    # aplica sem derrubar sessões abertas
```

O que cada linha faz:

- `PasswordAuthentication no` — recusa qualquer tentativa de login por senha. **É a configuração de maior impacto de todo este documento**: sozinha, ela torna inútil a esmagadora maioria dos ataques automatizados.
- `PermitRootLogin no` — recusa login direto como `root`, mesmo com chave. Quem quiser privilégio de administrador precisa entrar como usuário comum e usar `sudo` — o que deixa rastro em log.
- `PubkeyAuthentication yes` — confirma explicitamente que chave continua permitida (é o padrão, mas ser explícito evita depender de um padrão que pode mudar).

E os dois comandos:

- `sshd -t` testa a configuração e falha se houver erro de digitação. **Nunca pule este passo** — aplicar um arquivo com erro de sintaxe pode impedir o serviço de subir, e aí ninguém mais entra.
- `systemctl reload ssh` recarrega a configuração **sem** derrubar as conexões já abertas (diferente de `restart`, que derruba). Se algo estiver errado, sua sessão atual sobrevive e você ainda pode consertar.

> **Duas armadilhas reais desta VPS, ambas custaram tempo:**
>
> **1) Arquivos de configuração em conflito.** Provedores costumam deixar vários arquivos dentro de `/etc/ssh/sshd_config.d/`. O OpenSSH, para cada configuração, obedece ao **primeiro** valor que encontra — não ao último. Como os arquivos são lidos em ordem alfabética, um arquivo do provedor chamado `50-alguma-coisa.conf` dizendo `PasswordAuthentication yes` **vence** um arquivo `60-outra.conf` dizendo `no`. O resultado é traiçoeiro: você "desligou" a senha, o arquivo está lá, e a senha continua ligada. Sempre confirme o valor **efetivo**, nunca o que está escrito no seu arquivo:
>
> ```bash
> sudo sshd -T | grep -E "passwordauthentication|permitrootlogin"
> ```
>
> Se o resultado discordar do que você escreveu, procure o arquivo conflitante (`ls /etc/ssh/sshd_config.d/`) e consolide tudo num único arquivo coerente.
>
> **2) O serviço não se chama `sshd` no Ubuntu 24.04.** Ele se chama `ssh`. Um `systemctl restart sshd` falha com "Unit sshd.service not found". Confirme o nome real com `systemctl list-units --type=service | grep -i ssh` — isso volta a importar no item 1.4.

Depois de aplicar, **reconfirme numa sessão nova** antes de fechar a antiga. Um `ssh root@<ip-da-vm>` agora deve ser recusado com `Permission denied (publickey)` — esse erro é o resultado correto.

## 1.4 Fail2ban: banir quem insiste

Com senha desligada, um atacante não consegue entrar por força bruta. Mas ele continua **tentando**, indefinidamente, consumindo recursos e poluindo os logs. O `fail2ban` observa os registros de tentativas de login e bane automaticamente (via firewall) qualquer endereço que erre demais.

É uma camada complementar, não substituta: ela não conserta uma configuração de SSH fraca, mas reduz ruído e protege contra ataques que exploram alguma falha futura na negociação de login.

```bash
sudo apt update && sudo apt install -y fail2ban
```

A configuração vai num arquivo próprio, `jail.local` — nunca edite os arquivos `.conf` originais do pacote, porque eles são sobrescritos a cada atualização:

```bash
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
backend = systemd
port = ssh
journalmatch = _SYSTEMD_UNIT=ssh.service
EOF
sudo systemctl enable --now fail2ban
```

Os três números que definem a política:

- `maxretry = 5` — quantas tentativas falhas são toleradas.
- `findtime = 10m` — dentro de qual janela de tempo elas são contadas. Cinco erros em dez minutos = ataque; cinco erros ao longo de um mês = alguém distraído.
- `bantime = 1h` — por quanto tempo o endereço fica bloqueado. Uma hora já inviabiliza a economia de um ataque automatizado, sem o risco de banir você mesmo permanentemente por um engano.

> **Armadilha crítica — sem esta linha, o fail2ban não protege nada.** A última linha (`journalmatch`) existe por causa da armadilha 2 do item anterior: o filtro que vem de fábrica procura por um serviço chamado `sshd.service`, que **não existe** no Ubuntu 24.04 (lá é `ssh.service`). Sem corrigir isso, o fail2ban roda, aparece como "ativo", não dá erro nenhum — e **nunca bane ninguém**, porque está lendo um registro vazio. É o pior tipo de falha de segurança: a que parece proteção.

**Sempre verifique que ele está realmente enxergando as tentativas**, em vez de confiar no "ativo":

```bash
sudo fail2ban-client status sshd
```

Confira a linha `Journal matches` — ela precisa apontar para o serviço que existe de fato na sua máquina. Para uma prova definitiva, teste o filtro contra o histórico real do sistema:

```bash
sudo fail2ban-regex systemd-journal /etc/fail2ban/filter.d/sshd.conf \
  --journalmatch "_SYSTEMD_UNIT=ssh.service" 2>&1 | tail -20
```

A linha `Lines: ... matched` no fim mostra quantas tentativas o filtro reconheceu no histórico. Se vier zero e a máquina já está exposta há horas, o filtro está errado.

---

# Parte 2 — Rede: quais portas o mundo enxerga

## 2.1 O princípio: negar tudo, liberar o mínimo

Cada porta aberta é uma porta pela qual alguém pode tentar entrar. A configuração correta de um firewall não é "bloquear o que é perigoso" — é **bloquear tudo por padrão e liberar só o indispensável**, um a um, conscientemente. Isso se chama *negar por padrão*, e é o mesmo princípio que governa o código desta aplicação.

O Ubuntu traz o `ufw`, uma interface simples para o firewall do sistema:

```bash
sudo ufw default deny incoming    # ninguém entra, salvo o que for liberado abaixo
sudo ufw default allow outgoing   # a máquina pode iniciar conexões para fora
sudo ufw allow 22/tcp  comment 'SSH'
sudo ufw allow 80/tcp  comment 'HTTP (redirect + desafio do certificado)'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable
```

Por que exatamente essas três portas, e nenhuma outra:

- **22** — acesso administrativo (SSH). Sem ela você perde o controle da máquina.
- **80** — necessária mesmo que o site só use HTTPS, por dois motivos: redirecionar quem digitou `http://` para a versão segura, e permitir que a autoridade certificadora valide o domínio na hora de emitir o certificado (esse processo bate na porta 80).
- **443** — o HTTPS em si, o tráfego real do site.

Note que *saída* é liberada (`allow outgoing`) enquanto *entrada* é negada. A assimetria é intencional: a máquina precisa buscar atualizações e certificados, mas ninguém de fora precisa iniciar conversa com ela, exceto pelas três portas acima.

## 2.2 O que fica fechado — e por que isso importa muito

O banco de dados e a API da aplicação **não têm porta aberta para a internet**. Isso não é um esquecimento; é a decisão de segurança mais valiosa desta topologia.

- **O banco de dados** só é alcançável de dentro da rede interna dos containers. Mesmo que sua senha vazasse, não haveria por onde usá-la de fora.
- **A API (backend)** também não é publicada diretamente. Todo acesso passa obrigatoriamente pelo proxy reverso (Caddy), que aplica TLS e cabeçalhos de segurança antes de repassar qualquer coisa adiante. Não existe caminho alternativo que contorne essas proteções.
- **O painel de monitoramento** escuta apenas no endereço interno da própria máquina (`127.0.0.1`), que é inalcançável de fora por definição. Para acessá-lo, cria-se um túnel temporário através do SSH:

  ```bash
  ssh -L 3001:localhost:3001 <usuario>@<ip-da-vm>
  ```

  Esse comando faz a porta 3001 do **seu** computador desembocar na porta 3001 **da VPS**, através da conexão SSH já autenticada. Você abre `http://localhost:3001` no seu navegador e enxerga o painel remoto — mas nada foi exposto à internet, e o túnel morre quando você fecha o SSH. É o padrão para administrar serviços internos sem publicá-los.

## 2.3 Verificar o que está *realmente* escutando

Regra de firewall é intenção; o que vale é o que os processos de fato abriram. Confira as duas coisas separadamente:

```bash
sudo ufw status verbose    # a intenção
sudo ss -tlnp              # a realidade
```

No resultado do `ss`, olhe a coluna de endereço local de cada linha:

- `0.0.0.0:<porta>` ou `[::]:<porta>` — **exposto a qualquer origem**. Só deve aparecer para 22, 80 e 443.
- `127.0.0.1:<porta>` — acessível apenas de dentro da própria máquina. Seguro.

Qualquer serviço inesperado escutando em `0.0.0.0` merece investigação imediata.

> **Atenção com Docker e firewall.** O Docker manipula as regras de rede do sistema por conta própria e, ao publicar uma porta, pode contornar o `ufw` — uma porta publicada no `docker-compose.yml` como `"3001:3001"` fica acessível ao mundo **mesmo com o `ufw` configurado para negá-la**. A proteção real é publicar explicitamente amarrado ao endereço interno (`"127.0.0.1:3001:3001"`), como este projeto faz. Nunca confie apenas no firewall para conter uma porta de container.

---

# Parte 3 — Privilégio: o que um invasor conseguiria fazer

As camadas anteriores tentam impedir a entrada. Esta assume que alguém entrou — por uma falha na aplicação, numa dependência, no que for — e limita o estrago.

## 3.1 A aplicação roda com um usuário sem poderes

Os containers da aplicação não rodam como seu usuário administrativo, e sim como um usuário de serviço dedicado, criado sem capacidade de login:

```bash
getent passwd <usuario-de-servico>
```

O final da linha deve mostrar `/usr/sbin/nologin`. Isso significa que, mesmo que alguém consiga executar comandos como esse usuário, não consegue abrir uma sessão interativa com ele. Ele existe só para ser dono dos arquivos e rodar os processos — não é uma conta de pessoa.

## 3.2 Containers sem privilégio elevado

Um container pode ser configurado para ter acesso quase total ao sistema hospedeiro (modo `privileged`) — o que anula boa parte do isolamento que containers oferecem. Nenhum container deste projeto usa isso. Confirme:

```bash
sudo docker inspect $(sudo docker ps -q) \
  --format "{{.Name}}: Privileged={{.HostConfig.Privileged}}"
```

Todos devem responder `Privileged=false`. Um container privilegiado comprometido é, na prática, a máquina inteira comprometida.

## 3.3 Dois usuários no banco de dados, com poderes diferentes

Esta é uma das defesas mais eficazes e menos comuns. O banco tem dois usuários distintos:

- Um **administrativo**, capaz de criar e apagar tabelas. Usado exclusivamente em operações pontuais de manutenção (aplicar uma migração, por exemplo) e nunca pela aplicação em funcionamento.
- Um **de execução**, que a aplicação usa 24h por dia, com permissão apenas para ler e escrever linhas — **não** para alterar a estrutura do banco.

A consequência é concreta: se alguém explorar uma falha na aplicação, o alcance máximo é o conteúdo das tabelas. Apagar tabelas, criar tabelas ou alterar o esquema fica fora de alcance, porque o usuário que a aplicação carrega simplesmente não tem esse direito.

Verifique periodicamente que a separação continua valendo — **este comando tem que falhar**:

```bash
docker compose exec postgres psql -U <usuario-de-execucao> -d "$POSTGRES_DB" \
  -c 'CREATE TABLE regression_check (x int);'
# esperado: ERROR: permission denied for schema public
```

Se ele **funcionar**, a separação foi perdida em algum momento e precisa ser restaurada — é um achado grave.

## 3.4 Permissão dos arquivos de configuração

Os arquivos `.env` guardam senhas e chaves de criptografia. Eles precisam ser legíveis **apenas** pelo dono:

```bash
find . -maxdepth 3 -name ".env" -exec ls -la {} \;
```

O que você quer ver no começo de cada linha é `-rw-------` (permissão `600`: só o dono lê e escreve). Se aparecer `-rw-r--r--` (`644`), qualquer usuário da máquina consegue ler aquele arquivo — corrija:

```bash
chmod 600 <caminho-do-arquivo>
```

> **Achado real desta auditoria:** o arquivo de configuração do frontend estava em `644`, enquanto os outros três estavam corretamente em `600`. Naquele caso específico não havia segredo no arquivo (só configuração pública do site), então o risco era nulo — mas foi corrigido mesmo assim. O motivo de corrigir um problema "sem impacto" é evitar que a exceção vire hábito: no dia em que alguém acrescentar um segredo naquele arquivo, a permissão já estará certa.

---

# Parte 4 — Manutenção: falhas conhecidas corrigidas

## 4.1 Atualizações automáticas de segurança

A maior parte das invasões bem-sucedidas não usa uma falha nova e sofisticada — usa uma falha **antiga, já corrigida**, numa máquina que ninguém atualizou. Atualização é, estatisticamente, a defesa de melhor retorno que existe.

O Ubuntu resolve isso com o `unattended-upgrades`, que instala correções de segurança sozinho:

```bash
sudo apt install -y unattended-upgrades apt-listchanges
sudo systemctl enable --now unattended-upgrades
```

Confirme que está de fato ativo (não basta estar instalado):

```bash
systemctl is-enabled unattended-upgrades   # esperado: enabled
systemctl is-active unattended-upgrades    # esperado: active
cat /etc/apt/apt.conf.d/20auto-upgrades    # ambas as linhas devem estar em "1"
```

## 4.2 Reinício para aplicar atualizações de kernel

Há uma exceção importante ao automatismo acima: correções no **kernel** (o núcleo do sistema) são baixadas e instaladas automaticamente, mas **só passam a valer depois de reiniciar a máquina**. Até lá, o sistema continua executando a versão antiga, com a falha aberta.

Verifique se há um kernel novo esperando:

```bash
uname -r                              # o kernel em execução agora
ls /boot/vmlinuz-* | sort -V | tail -1  # o kernel mais novo instalado
```

Se forem diferentes, há uma atualização pendente de reinício. O sistema também costuma avisar no login. Reiniciar é seguro e rápido nesta topologia — os containers estão configurados com `restart: unless-stopped`, ou seja, o Docker os religa sozinho assim que o sistema volta:

```bash
sudo reboot
```

A indisponibilidade é de menos de um minuto. Depois que voltar, confirme que tudo subiu:

```bash
uname -r                    # deve mostrar a versão nova
docker compose ps           # todos os serviços de volta e saudáveis
```

## 4.3 Backup cifrado — e por que a chave privada nunca vai para o servidor

Backup é segurança tanto quanto firewall: protege contra o pior cenário (perda total da máquina, ataque de resgate, erro humano irreversível).

O backup deste projeto é **cifrado com criptografia assimétrica**, o que resolve um problema sutil e importante. Existem duas chaves:

- A **chave pública** fica no servidor e só serve para **cifrar**.
- A **chave privada** fica **fora** do servidor e é a única capaz de **decifrar**.

A consequência é a razão de ser desse desenho: mesmo que a VPS inteira seja comprometida, o atacante encontra os backups cifrados e a chave que só sabe cifrar — **não consegue ler nada**. Se a mesma chave fizesse as duas coisas e estivesse no servidor, os backups cairiam junto com a máquina que deveriam proteger.

Isso impõe uma responsabilidade que nenhum comando resolve por você: **guarde a chave privada num lugar estável e definitivo, fora do servidor e fora do repositório**. Não numa pasta solta que pode ser movida ou apagada por engano. Sem ela, os backups são irrecuperáveis — inclusive por você.

E uma regra que vale repetir: **um backup que nunca foi restaurado não é um backup**, é uma suposição. Teste a restauração pelo menos uma vez, de verdade, num banco descartável, conferindo se os dados chegaram — o procedimento completo está no `DEPLOY.md`, seção "Backup e restauração testada".

---

# Parte 5 — Transporte: TLS/HTTPS

O HTTPS garante duas coisas ao visitante: que ninguém no caminho consegue **ler** o tráfego, e que ninguém consegue **alterá-lo**. Sem ele, qualquer intermediário (o Wi-Fi da cafeteria, o provedor, alguém na mesma rede) enxerga senhas e dados em texto claro.

Neste projeto, o proxy reverso (Caddy) obtém e **renova sozinho** o certificado, sem intervenção e sem tarefa agendada. Não há nada a manter manualmente — mas há o que verificar:

```bash
# Validade e emissor do certificado
echo | openssl s_client -connect <seu-dominio>:443 -servername <seu-dominio> 2>/dev/null \
  | openssl x509 -noout -dates -issuer

# Cabeçalhos de segurança presentes na resposta
curl -sI https://<seu-dominio>/ | grep -iE "strict-transport|content-security|x-content-type"

# A versão sem criptografia deve redirecionar, nunca servir o site
curl -sI http://<seu-dominio>/ | head -3
```

O que os cabeçalhos fazem, em linguagem simples:

- **`Strict-Transport-Security` (HSTS)** — instrui o navegador a **nunca mais** acessar este site sem criptografia, mesmo que o usuário digite `http://`. Fecha a janela de ataque que existe no primeiro redirecionamento.
- **`Content-Security-Policy`** — limita o que a página pode carregar e executar, reduzindo drasticamente o impacto de uma injeção de código malicioso.
- **`X-Content-Type-Options: nosniff`** — impede o navegador de "adivinhar" o tipo de um arquivo, truque usado para fazer um arquivo aparentemente inofensivo ser executado como script.

---

# Auditoria: como verificar tudo isso sozinho

Configurar uma vez não basta — configurações se perdem em atualizações, mudanças e correções às pressas. O bloco abaixo reúne as verificações das cinco partes num único comando, para rodar periodicamente ou depois de qualquer mudança na infraestrutura.

```bash
echo "=== 1. Acesso (SSH) — valores EFETIVOS ==="
sudo sshd -T | grep -E "^(permitrootlogin|passwordauthentication|pubkeyauthentication|permitemptypasswords)"

echo "=== 2. Fail2ban — está enxergando o serviço certo? ==="
sudo fail2ban-client status sshd

echo "=== 3. Firewall — intenção ==="
sudo ufw status verbose

echo "=== 4. Firewall — realidade (o que escuta de fato) ==="
sudo ss -tlnp

echo "=== 5. Containers sem privilégio elevado ==="
sudo docker inspect $(sudo docker ps -q) --format "{{.Name}}: Privileged={{.HostConfig.Privileged}}"

echo "=== 6. Usuário de serviço sem shell de login ==="
getent passwd <usuario-de-servico>

echo "=== 7. Permissão dos arquivos de configuração ==="
find /opt/<projeto> -maxdepth 3 -name ".env" -exec ls -la {} \;

echo "=== 8. Atualizações automáticas ==="
systemctl is-enabled unattended-upgrades; systemctl is-active unattended-upgrades

echo "=== 9. Kernel pendente de reinício? ==="
uname -r; ls /boot/vmlinuz-* | sort -V | tail -1

echo "=== 10. Espaço em disco (disco cheio derruba tudo) ==="
df -h /
```

**Como ler o resultado** — cada item tem uma resposta certa:

| # | Verificação | Resposta correta |
|---|---|---|
| 1 | SSH | `permitrootlogin no`, `passwordauthentication no`, `permitemptypasswords no` |
| 2 | Fail2ban | `Journal matches` apontando para o serviço que existe na máquina |
| 3 | Firewall | `Status: active`, `deny (incoming)`, só 22/80/443 liberadas |
| 4 | Portas | Nada em `0.0.0.0`/`[::]` além de 22, 80 e 443 |
| 5 | Containers | Todos `Privileged=false` |
| 6 | Usuário de serviço | Termina em `/usr/sbin/nologin` |
| 7 | Arquivos `.env` | Todos `-rw-------` |
| 8 | Atualizações | `enabled` e `active` |
| 9 | Kernel | As duas versões iguais (senão, reiniciar) |
| 10 | Disco | Uso confortável, com folga para logs e backups |

E, do lado de fora da máquina, três confirmações que só fazem sentido pela internet:

```bash
# O certificado é válido e o site responde por HTTPS
curl -sI https://<seu-dominio>/ | head -3

# O banco NÃO pode estar acessível de fora — este teste deve falhar
timeout 3 bash -c "</dev/tcp/<ip-da-vm>/5432" && echo "ABERTO (grave)" || echo "recusado (correto)"

# A API NÃO pode estar exposta diretamente — este teste deve falhar
timeout 3 bash -c "</dev/tcp/<ip-da-vm>/<porta-da-api>" && echo "ABERTO (grave)" || echo "recusado (correto)"
```

---

# Decisões conscientes: o que NÃO foi feito, e por quê

Segurança tem custo, e nem toda recomendação vale a pena em todo contexto. Estas foram avaliadas e **deliberadamente não adotadas** — registrar o porquê evita que alguém "conserte" no futuro sem entender o trade-off.

**Restringir o acesso remoto a um único endereço de origem.** É uma recomendação legítima e comum. Não foi adotada porque a maioria das conexões domésticas no Brasil tem endereço **dinâmico** — ele muda sozinho, sem aviso. Como o login por senha e o acesso como `root` já estão desativados, uma mudança de endereço deixaria o administrador **permanentemente trancado para fora**, com recuperação dependendo do console de emergência do provedor. O risco operacional supera o ganho, já que a porta protegida só aceita chave. Faz sentido reconsiderar se houver endereço fixo ou VPN.

**Mudar o acesso remoto para uma porta não padrão.** Reduz o ruído nos logs, mas não é segurança de verdade — um escaneamento de portas encontra o serviço em segundos. Ganho cosmético, custo de confusão permanente. Não adotado.

**VPN para administração.** Seria a resposta certa para o primeiro item, e é o caminho natural caso este ambiente cresça. Não adotado por ora: acrescenta um componente novo para manter e proteger, o que num projeto de um desenvolvedor só é custo real. Decisão a revisitar se houver mais de um administrador.

---

# Higiene de dados sensíveis num repositório público

Este repositório é público. Isso significa que **qualquer coisa commitada pode ser lida por qualquer pessoa, para sempre** — inclusive depois de apagada, porque o histórico do Git preserva o conteúdo removido. Um atacante não precisa invadir nada: basta ler.

## O que nunca pode ser commitado

| Categoria | Exemplos | Por que importa |
|---|---|---|
| **Segredos** | Senhas, chaves de criptografia, tokens de API, chaves privadas | Acesso direto. Se vazar, considere comprometido e **troque imediatamente** — apagar do repositório não basta. |
| **Endereços da infraestrutura** | IP público, hostname atribuído pelo provedor | É o alvo. Reduz o trabalho do atacante de "encontrar" para "atacar". |
| **Identificadores do provedor** | Número da instância, ID da conta | Munição para engenharia social contra o suporte do provedor. |
| **Nomes de usuário do sistema** | O usuário administrativo real | Metade das credenciais. Não vale entregar de graça. |
| **Dados pessoais reais** | E-mails, documentos, endereços de pessoas | Além do risco, é obrigação legal (LGPD). |

## Como manter isso sob controle

1. **Placeholders em toda documentação.** Este documento e o `DEPLOY.md` usam `<ip-da-vm>`, `<usuario>`, `<seu-dominio>`. O texto continua compreensível e não entrega nada.
2. **`.gitignore` cobrindo `.env`**, com exceção explícita para os arquivos `.env.example` — que trazem os *nomes* das variáveis, jamais os valores.
3. **Todo segredo gerado dentro do servidor**, gravado direto no arquivo de destino, sem passar por área de transferência, histórico de terminal ou conversa.
4. **Varredura periódica** do que está versionado — os comandos estão logo abaixo.

## Varredura de vazamento

```bash
# Endereços IP públicos (ignora faixas privadas e de documentação)
git grep -nIE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' -- . ':(exclude)*.lock' \
  | grep -vE '127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.0\.|203\.0\.113\.'

# Hostname do provedor (ajuste o padrão ao seu)
git grep -nI -iE 'srv[0-9]{6,}|<dominio-do-provedor>'

# Material de chave privada
git grep -nI -E 'BEGIN (RSA|OPENSSH|PRIVATE|EC) |AGE-SECRET-KEY'

# Valores que parecem segredo de verdade
git grep -nIE '(SECRET|PASSWORD|TOKEN|API_KEY)\s*=\s*["\x27]?[A-Za-z0-9+/=_-]{16,}' \
  | grep -viE '\.test\.|example|placeholder|your-|change-me'

# Nenhum .env versionado além dos exemplos
git ls-files | grep -E '\.env'
```

> **Achado desta auditoria, e a lição sobre calibrar gravidade.** O hostname que o provedor atribui à VPS apareceu numa entrada do changelog. Foi removido do arquivo — mas o commit já estava publicado, então o valor **permanece no histórico do Git**, e reescrever histórico publicado não se justificava.
>
> A parte instrutiva é a verificação que veio depois. Antes de tratar isso como incidente, vale perguntar: *esse dado era mesmo secreto?* A resposta, medida com três comandos, foi **não**:
>
> ```bash
> dig +short <seu-dominio>              # o domínio público entrega o IP
> dig +short -x <ip-obtido>             # o DNS reverso entrega o hostname
> ```
>
> O **DNS reverso do IP é publicado pelo próprio provedor** — qualquer pessoa obtém aquele hostname a partir do domínio do site em segundos, sem nunca abrir o repositório. O commit não expôs nada que já não fosse público por construção.
>
> Duas lições, e a segunda é a mais fácil de esquecer:
>
> 1. **Remover depois não desfaz a publicação.** Para segredo de verdade — senha, chave, token — a única resposta correta a um vazamento é **trocar o valor**, nunca apenas apagá-lo do arquivo.
> 2. **Nem tudo que parece vazamento é vazamento.** Classificar gravidade sem verificar produz dois erros caros: pânico com dado já público (e retrabalho inútil, como reescrever histórico à toa) ou complacência com dado realmente sensível. Meça antes de reagir — e note que o inverso da conclusão acima também vale: se o dado tivesse sido uma senha, o fato de "estar só no histórico" não o tornaria menos grave.

---

# Resumo executivo

O que está em vigor nesta VPS, e o que cada item entrega:

| Camada | Configuração | O que impede |
|---|---|---|
| Acesso | Login por senha desativado | Ataques de força bruta |
| Acesso | `root` sem acesso direto | O alvo mais óbvio some do mapa |
| Acesso | Somente chave SSH | Credencial inviável de adivinhar |
| Acesso | Fail2ban com filtro validado | Insistência automatizada é banida |
| Rede | Firewall negando por padrão | Superfície reduzida a três portas |
| Rede | Banco e API sem porta pública | Não há caminho que contorne o proxy |
| Rede | Monitoramento só por túnel SSH | Painel administrativo fora da internet |
| Privilégio | Usuário de serviço sem shell | Sessão interativa indisponível |
| Privilégio | Containers sem modo privilegiado | Isolamento preservado |
| Privilégio | Banco com dois usuários | Aplicação não altera estrutura do banco |
| Privilégio | `.env` legível só pelo dono | Segredo não vaza entre usuários |
| Manutenção | Atualizações automáticas | Falhas conhecidas fechadas sozinhas |
| Manutenção | Backup cifrado, chave fora do servidor | Backup sobrevive ao comprometimento |
| Transporte | TLS com renovação automática | Tráfego ilegível no caminho |

Nenhuma dessas camadas é suficiente sozinha. Juntas, elevam o custo de um ataque muito acima do que um alvo desta natureza justifica — que é exatamente o objetivo realista de segurança para um projeto deste porte.
