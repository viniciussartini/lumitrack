# Registro de restaurações testadas

> Um backup nunca restaurado não é um backup. Este arquivo é o log
> append-only exigido pelo DoD de `11-seguranca-infraestrutura.md`
> ("restauração de backup testada, com data registrada") — toda vez que o
> procedimento de `.claude/docs/DEPLOY.md` § "Backup e restauração testada"
> for executado, adicione uma entrada abaixo. Nunca apague entradas
> antigas.

**Formato de cada entrada:**

```
## {YYYY-MM-DD} — {ambiente: produção | validação local}

- **Quem:** {responsável}
- **Arquivo restaurado:** {nome do dump ou "gerado na hora, para validar o mecanismo"}
- **Resultado:** {passou / falhou — o que foi conferido}
- **Notas:** {observações, se houver}
```

---

## 2026-08-22 — validação local do mecanismo (cifra + restauração)

- **Quem:** Claude Code (implementação da issue #248), a pedido do autor.
- **Arquivo restaurado:** não é um backup de produção — produção ainda não existe (Fase 13.7 pendente). Validação do **mecanismo**: dump de uma tabela descartável (`t`, 3 linhas) → `gzip` → `age -r <chave-pública-descartável>` → confirmado que o arquivo cifrado não contém o texto claro (`grep` não encontra as linhas originais) → `age -d -i <chave-privada-descartável>` → `gunzip` → `psql` restaurando num banco novo, também descartável.
- **Resultado:** passou. As 3 linhas voltaram idênticas (`SELECT * FROM t` no banco restaurado bateu com o banco de origem). Chave de teste e os dois bancos descartáveis foram apagados ao final — nada disso toca produção nem fica no repositório.
- **Notas:** valida que o pipe `pg_dump | gzip | age -r <chave-pública>` (escrita) e `age -d -i <chave-privada> | gunzip | psql` (leitura) funcionam ponta a ponta com o binário real do `age` (v1.3.1). **Não substitui** o primeiro teste de restauração real, contra um dump de produção de verdade — essa entrada ainda falta, a ser preenchida assim que a Fase 13.7 (ou a cifra em Neon) estiver no ar e o timer `lumitrack-backup.timer` tiver produzido pelo menos um dump real.

## 2026-08-23 — produção (VPS Hostinger), restauração completa

- **Quem:** Claude Code (execução da Fase 13.7), a pedido do autor.
- **Arquivo restaurado:** `lumitrack-20260823T012102Z.sql.gz.age` — dump real do `lumitrack-backup.timer`/`deploy/backup-postgres.sh` rodando pela primeira vez na VPS (dados do seed de demonstração, não há usuário real ainda).
- **Resultado:** passou, ponta a ponta. Baixado para a máquina local, decifrado com `age -d -i backup-key.txt`, descomprimido com `gunzip` e restaurado via `docker exec -i <postgres:16 descartável> psql` num banco novo (`restore_test`, container `lumitrack-restore-test`, porta 5433 só em 127.0.0.1). Todas as tabelas do schema vieram (`\dt` — `users`, `properties`, `meter_readings` etc.); `SELECT count(*) FROM meter_readings` bateu com o dado real da VPS na hora do dump (33 leituras). Container e arquivos baixados apagados ao final — nada disso toca produção nem fica no repositório.
- **Notas:** a tentativa inicial nesta mesma sessão só validou a decriptação (Docker não estava instalado localmente); o autor instalou o Docker à parte (problema não relacionado de repositório apt com chave GPG ausente, resolvido por ele) e o teste foi completado. ~50 linhas `ERROR: role "lumitrack_app" does not exist` no `psql` são esperadas e inofensivas — o dump inclui `GRANT`/`ALTER ... OWNER` para o papel de runtime, que não existe (nem precisa existir) no banco descartável de teste; não impede a restauração dos dados. Também durante esta sessão a pasta `lumitrack-secrets/` (fora do repositório, guarda a chave privada) foi temporariamente movida pelo autor e devolvida ao lugar — nenhuma chave foi perdida, mas reforça o próprio aviso do `DEPLOY.md`: a chave privada precisa de um local de guarda **estável e definitivo**, não uma pasta solta que pode ser movida por engano.
