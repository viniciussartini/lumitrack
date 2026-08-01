# ADR-0003 — MFA opcional via TOTP + backup codes

- **Data:** 2026-07-31
- **Status:** aceita
- **Branch/Issue relacionada:** sub-issues #12 (API) e #18 (UI), ver `.claude/docs/AUDITORIA_SEGURANCA.md`

## Contexto

O item "MFA: método e em quais ações" estava aberto em `07-decisoes-em-aberto.md`, mas já foi decidido e implementado — este ADR formaliza uma decisão que o código já expressa. A auditoria de segurança apontava ausência de segundo fator como achado A07 (Authentication Failures).

## Decisão

Vamos oferecer **MFA opcional via TOTP** (`otplib`), ativável pelo usuário em `Configurações → Segurança`: setup com QR code, confirmação com um código válido antes de `mfaEnabled` virar `true`, e um lote de **backup codes de uso único** (hash bcrypt, mesmo padrão da senha) para o caso de perda do dispositivo autenticador. Quando habilitado, o segundo fator é exigido em **todo login** (não só em ações sensíveis específicas) — `POST /api/auth/login/mfa`, sob o mesmo rate limiter estrito do login. O segredo TOTP é armazenado cifrado (AES-256-GCM, chave própria `MFA_SECRET_ENCRYPTION_KEY`), nunca em texto claro.

Lockout de conta após N tentativas falhas **não** está implementado — gap conhecido e aceito, coberto pelo rate limiter por IP+e-mail.

## Alternativas consideradas

- **E-mail/SMS como segundo fator** — dependência de provedor externo (custo, latência, mais uma integração a proteger); TOTP não exige rede no momento da verificação e é padrão de mercado para app solo.
- **MFA obrigatório para todos** — fricção desnecessária para o perfil de usuário residencial (B1) do MVP; mantido opcional, com a decisão de ativar delegada ao usuário.
- **MFA só em ações sensíveis específicas** (não no login) — mais complexo de implementar corretamente (exigiria "step-up auth" por rota) sem ganho claro para o modelo de ameaça atual; descartado em favor de exigir no login quando habilitado.

## Consequências

- Positivas: mitigação de credential stuffing/phishing de senha isolada; backup codes evitam lockout permanente por perda de dispositivo; segredo nunca em texto claro no banco.
- Negativas/custos: sem lockout de conta, ainda depende do rate limiter como única defesa contra força bruta de senha/código; UX de setup (QR code + backup codes) é uma tela adicional que precisa de cuidado de acessibilidade.
- Veio de `07-decisoes-em-aberto.md` — item removido de lá.
