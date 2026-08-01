# Runbook de Resposta a Incidentes de Segurança — LumiTrack

> **Documento:** Procedimentos operacionais de resposta a incidentes de segurança/privacidade.
> **Escopo:** Incidentes que possam afetar dados pessoais ou integridade do sistema.
> **Base legal:** LGPD Art. 48 (resposta a incidentes). Documento vivo — atualizar a cada incidente real ou mudança de procedimento.
> **Papéis:** Para este documento, assume-se uma estrutura mínima (startup/fase inicial). Em escala, designar explicitamente: Incident Commander, Data Protection Officer (DPO), Security Lead, DevOps/SRE.

---

## 1. Detecção e classificação

### 1.1 Fontes de detecção

**Logs estruturados (pino):** Todos os eventos de autenticação, autorização e erros 5xx são registrados em JSON (backend `backend/src/shared/logger/logger.ts`, `pino-http`). Em produção, rotear para um agregador externo (CloudWatch, DataDog, etc.).

**Tabela `audit_logs` (banco):** Registra login/logout (sucesso/falha), acessos negados (403), CRUD de User/Property, MFA setup/disable, data export (Art. 18) — acessível via Prisma Studio ou SQL direto enquanto não há endpoint admin (#16).

**CI/CD gates (`npm audit`, Dependabot):** GitHub Actions (`.github/workflows/ci.yml`) bloqueia PRs com vulnerabilidades high/critical, notifica sobre moderate. Dependabot (`dependabot.yml`) abre PRs automaticamente para atualizações semanalmente.

**Alertas operacionais (futuro):** Health checks de banco, CPU/memória (hoje ausente; considerar adicionar em produção).

### 1.2 Classificação de severidade

Use esta matriz para decidir se o incidente exige comunicação aos titulares (Art. 48):

| Severidade | Exemplos | Risco relevante aos titulares? | Ação |
|------------|----------|-------------------------------|------|
| **Crítico** | Exposição de CPF/CNPJ/senha de > 100 titulares; chave de cifra comprometida; SQL injection confirmada | ✅ Sim | Notificar ANPD + titulares afetados |
| **Alto** | Exposição de CPF/CNPJ de 1-10 titulares; token de sessão roubado com história de consumo; acesso não-autorizado a account | ✅ Sim (avaliar caso a caso) | Notificar ANPD + titulares afetados |
| **Médio** | Falha temporária de criptografia de log (sem dados exposto); tentativa de brute-force bloqueada pelo rate limit; vulnerabilidade dev-only no Dependabot | ❓ Não (dados não exposto) | Investigar + patch rápido; documentar |
| **Baixo** | Typo em mensagem de erro; quebra de feature não-crítica; recomendação de atualização de dependência | ❌ Não | Log + correção no próximo ciclo de release |

**Pergunta chave para decidir:** "Um titular poderia ter sofrido dano ou risco significativo por causa deste incidente?" Se a resposta for "sim" ou "talvez", escale para Alto/Crítico.

---

## 2. Contenção e erradicação

Passos imediatos conforme o tipo de incidente:

### 2.1 Incidente: Credencial comprometida (senha, token, chave)

1. **Imediato:**
   - Se token de sessão (`auth_tokens`): marcar como revogado via UPDATE com `revokedAt = NOW()` — não deleta, deixa o histórico para auditoria (Art. 48).
   - Se senha: forçar reset via `password_resets.createdAt = NOW()` (usuário recebe e-mail do link); invalidar qualquer sessão anterior do usuário via bulk UPDATE de `auth_tokens`.

2. **Curto prazo (1-48h):**
   - Rotacionar chave de segredo (se aplicável — ex.: JWT_SECRET, chaves de cifra CPF/CNPJ/MFA). Complexo: implica reissuing de JWTs/reencrypting de dados já persistidos. Considerar parar o serviço durante a rotação.
   - Se chave de SMTP: resetar credencial no provedor, atualizar `SMTP_PASS` no `.env` de produção.

3. **Comunicação:**
   - Notificar DPO internamente.
   - Se for uma chave de infraestrutura (não token de usuário específico), revisar se há titulares afetados (ex.: se foi a chave de cifra CPF/CNPJ, **todos** os CPFs técnicamente ficaram expostos — escalada para Crítico).

### 2.2 Incidente: Acesso não-autorizado a dados (account takeover, bug de autorização)

1. **Imediato:**
   - Verificar `audit_logs` para descobrir **quem** acessou o quê (filtrar por IP/user-agent da requisição suspeita, descobrir userId/resourceId/resourceType).
   - Usar export DSAR (#09) do usuário afetado para reconstruir quais dados foram acessados e quando.
   - Se houver múltiplos usuários afetados, usar `audit_logs.findMany({where: {action: "ACCESS_DENIED", ...}})` para mapear o padrão (ex.: todas as requisições falhando em um mesmo endpoint sugere um bug, todas em usuários com CPF em JSON sugere vazamento no erro).

2. **Curto prazo:**
   - Patch o bug de autorização e deploy.
   - Revogar tokens dos usuários afetados (mesmo padrão de token comprometido).
   - Resetar senhas dos afetados (aviso por e-mail).

3. **Comunicação:**
   - Art. 48 aplicável: "risco relevante aos titulares" = sim se dados confidenciais (CPF, padrão de consumo) foram expostos. Notificar em prazo razoável.

### 2.3 Incidente: Vulnerabilidade de dependência (npm audit / Dependabot)

1. **Imediato:**
   - CI/CD já bloqueia high/critical. Se um evento chegar aqui, é porque:
     - Vulnerabilidade moderate que foi ignorada (conhecida, sem fix não-breaking — ex.: #11, vuln do Prisma devDependency).
     - Evento em staging/produção que passou despercebido no CI.

2. **Curto prazo:**
   - Atualizar a dependência vulnerável para a versão patched (se disponível).
   - Se não há patch não-breaking, avaliar se o risco é real no contexto do projeto (ex.: Prisma devDependency é baixo risco — só roda em build, não em tempo de execução). Documentar a decisão.

3. **Comunicação:**
   - Se for crítica/alta: Notificar DPO. Revisar se dados foram expostos (consultar logs).
   - Se for conhecida/documentada (ex.: moderate de devDependency): só documentar.

---

## 3. Avaliação de risco aos titulares

Use os mecanismos já existentes no sistema para reconstruir o que aconteceu:

### 3.1 Consultar `audit_logs` (método: SQL direto / Prisma Studio)

```sql
-- Exemplo: todos os acessos de um IP suspeito nos últimos 7 dias
SELECT * FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND ip_address = '203.0.113.45'
ORDER BY created_at DESC;

-- Exemplo: todas as tentativas de login falhadas de um usuário
SELECT * FROM audit_logs
WHERE user_id = 'user-xyz'
  AND action = 'LOGIN'
  AND outcome = 'FAILURE'
ORDER BY created_at DESC;

-- Exemplo: acessos negados em um endpoint (potencial bug de autorização)
SELECT action, resource_type, resource_id, COUNT(*) as count
FROM audit_logs
WHERE action = 'ACCESS_DENIED'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action, resource_type, resource_id;
```

### 3.2 Exportar dados do titular afetado (DSAR — Subject Access Request)

Se há suspeita de exposição de dados de um usuário específico:

```bash
# Endpoint: GET /api/users/me/data-export?format=json
# (autenticado como o titular)
# Retorna: identificação, properties, consumo completo, audit log do titular
```

O export em JSON traz **todos os `ConsumptionRecord`** do titular (sem paginação), ideal para conferir se houve acesso não-autorizado a dados de consumo durante o período do incidente.

### 3.3 Determinar "risco relevante"

**Risco relevante existe se:**
- CPF/CNPJ foi exposto (mesmo que criptografado — a chave de cifra também está em risco).
- Dados de consumo foram expostos (padrão de vida, vulnerabilidade a fraudes).
- E-mail + senha foram expostos (takeover de conta).
- Backup codes do MFA foram expostos.

**Risco relevante NÃO existe se:**
- Apenas metadata de requisições falhas foi registrada (ex.: tentativa de login com e-mail que não existe — conhecido do servidor).
- Apenas audit log técnico foi exposto (logs de 403 sem os dados reais).

---

## 4. Notificação à ANPD e aos titulares (Art. 48)

### 4.1 Quando notificar

**ANPD (Autoridade Nacional de Proteção de Dados):**
- Sempre que houver "risco relevante aos titulares" (vide 3.3).
- Prazo: comunicação em prazo razoável (ANPD reconhece 72h como referência, mas "razoável" pode ser menos em caso de incidente ainda ativo).

**Titulares afetados:**
- Quando há risco relevante E a ANPD foi notificada.
- Prazo: simultaneamente ou logo após ANPD, em linguagem clara.

### 4.2 Comunicação com a ANPD

**Canal:** https://www.gov.br/cidadania/pt-br/acesso-a-informacao/ouvidoria (formulário de notificação de incidente).

**Conteúdo mínimo:**
- Descrição factual do incidente.
- Data/hora de início e de descoberta.
- Categoria de dados afetados (dados de identificação, consumo, sessão, etc.).
- Número estimado de titulares afetados.
- Medidas de contenção já tomadas.
- Contato do DPO/responsável.

**Exemplo de comunicado:** Veja Apêndice A (template).

### 4.3 Comunicação com os titulares

**Template de e-mail:**

```
Assunto: Aviso de Incidente de Segurança — LumiTrack

Prezado [Titular],

Nos últimos [N dias/horas], identificamos um incidente de segurança que pode
ter afetado dados pessoais seus armazenados na plataforma LumiTrack.

Incidente: [Descrição factual e concisa, evitar jargão técnico]

Dados potencialmente afetados: [CPF, e-mail, histórico de consumo, etc.]

Medidas tomadas: [Senha resetada, sessões revogadas, acesso isolado, patch
aplicado, etc.]

Próximos passos:
- Você receberá um link de reset de senha por este e-mail.
- Recomendamos alterar sua senha imediatamente.
- Se tinha MFA habilitado, ele foi desabilitado por segurança — você pode
  reabilitá-lo após o login.

Contato: Se tiver dúvidas, entre em contato conosco em [DPO_EMAIL] ou
[SUPPORT_EMAIL]. A Autoridade Nacional de Proteção de Dados (ANPD) também
foi notificada.

Atenciosamente,
LumiTrack — Proteção de Dados
```

---

## 5. Registro e lições aprendidas

### 5.1 Documentar o incidente

Enquanto não há tabela formal `SecurityIncident` no banco (depende de RBAC/#16), registre o incidente em um arquivo/ticket externo:

**Campos obrigatórios:**
- ID único (ex.: INC-2024-001).
- Data/hora de descoberta.
- Categoria (credencial comprometida / acesso não-autorizado / vulnerabilidade / outro).
- Titulares afetados (nomes, ids, emails).
- Dados expostos.
- Root cause análise (o que saiu errado?).
- Medidas de contenção.
- Lições aprendidas.
- Status (Aberto / Mitigado / Fechado).

**Local:** Issue privada no GitHub / ticket no Jira / planilha compartilhada com DPO / conforme sua infraestrutura de gestão.

### 5.2 Atualizar procedimentos

A cada incidente:
1. Rever este runbook — há algum passo que falhou ou ficou omisso?
2. Atualizar `.claude/docs/AUDITORIA_SEGURANCA.md` se o incidente revelar um gap novo (ex.: "descobrimos que `propertyAddress` não era auditado, vamos adicionar à tabela `audit_logs` na próxima sub-issue").
3. Comunicar as lições à equipe em uma retrospectiva de segurança.

---

## Apêndice A: Template de notificação à ANPD

```
NOTIFICAÇÃO DE INCIDENTE DE PROTEÇÃO DE DADOS

Requerente: LumiTrack (CNPJ: XX.XXX.XXX/XXXX-XX)
Data da notificação: [DATA]

1. DESCRIÇÃO FACTUAL DO INCIDENTE
   [Descrição clara do que aconteceu, sem jargão técnico desnecessário]

2. DATA E HORA DE INÍCIO
   [Quando o incidente começou — pode ser "desconhecida" se descoberto depois]

3. DATA E HORA DE DESCOBERTA
   [Quando foi detectado]

4. CLASSIFICAÇÃO DO INCIDENTE
   ☐ Vazamento de dados
   ☐ Acesso não-autorizado
   ☐ Corrupção de dados
   ☐ Indisponibilidade do sistema
   ☐ Outro: ___________________

5. DADOS PESSOAIS AFETADOS
   ☐ Dados de identificação (nome, CPF, CNPJ)
   ☐ Dados de contato (e-mail, telefone)
   ☐ Dados financeiros (histórico de consumo, endereço)
   ☐ Dados de sessão/autenticação
   ☐ Outro: ___________________

6. NÚMERO DE TITULARES AFETADOS
   [N exato ou intervalo estimado]

7. POSSÍVEIS CONSEQUÊNCIAS
   [Prejuízo potencial aos titulares — ex.: fraude de identidade, exposição
   de padrão de vida, etc.]

8. MEDIDAS JÁ ADOTADAS
   [O que foi feito para mitigar: revogação de tokens, reset de senhas,
   patch de código, isolamento de dados, etc.]

9. MEDIDAS FUTURAS
   [Como será evitado no futuro: auditoria, testes de segurança, treinamento
   de equipe, mudança de processo, etc.]

10. CONTATO DO RESPONSÁVEL PELA NOTIFICAÇÃO
    Nome: [DPO ou responsável]
    E-mail: [EMAIL]
    Telefone: [TELEFONE]

Assinado digitalmente ou via e-mail autenticado.
```

---

## Apêndice B: Checklist pré-incidente (preventivo)

Antes de um incidente acontecer, certifique-se que:

- ☐ DPO (Data Protection Officer) está designado e seus contatos estão disponíveis 24/7.
- ☐ Backup do banco completo e testado (periodicamente fazer restore em ambiente de teste).
- ☐ Chaves de segredo (JWT_SECRET, ENCRYPTION_KEY, BLIND_INDEX_KEY, MFA_SECRET_ENCRYPTION_KEY) estão em um cofre seguro (AWS Secrets Manager, 1Password, etc.), não no `.env` de produção.
- ☐ Logs (pino) estão sendo roteados para um agregador externo (não só no filesystem do servidor — risco de perda se servidor explodir).
- ☐ Rate limiting está ativo (detecta brute-force cedo).
- ☐ Dependabot + CI/CD está verificando vulnerabilidades em cada PR (não esperar para produção).
- ☐ Testes de segurança manuais (OWASP ZAP, Burp Suite) são rodados periodicamente.
- ☐ Plano de comunicação com titulares foi aprovado por legal/DPO (não improvisar a redação durante o incidente).

---

## Apêndice C: Referências

- **LGPD Art. 48:** Lei nº 13.709/2018 — resposta a incidentes.
- **NIST Cybersecurity Framework:** https://www.nist.gov/cyberframework
- **OWASP Incident Response:** https://owasp.org/www-project-incident-response/
- **Documento de auditoria deste projeto:** `.claude/docs/AUDITORIA_SEGURANCA.md`
