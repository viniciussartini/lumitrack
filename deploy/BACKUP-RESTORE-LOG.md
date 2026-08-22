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
