/**
 * Canal de comunicação com o titular (LGPD Art. 18 §1º + Res. CD/ANPD
 * 2/2022, Art. 11) — Fase 11. O regime de agente de
 * pequeno porte dispensa o encarregado (DPO), mas não este canal: sem ele,
 * os direitos do Art. 18 que não são autoatendidos na plataforma (ver
 * `ProfilePage`) ficam, na prática, inexercíveis.
 *
 * Configurável via `VITE_PRIVACY_CONTACT_EMAIL` porque este repositório é um
 * projeto de portfólio, não uma operação real: quem fizer fork para uso
 * comercial define o endereço de fato monitorado no `.env` do próprio
 * deploy, sem tocar em código.
 *
 * O valor abaixo é um placeholder de exemplo. Antes de operar com titulares
 * reais, ele DEVE ser substituído por um endereço de fato monitorado — ver
 * `.claude/docs/PROCEDIMENTO_DIREITOS_TITULAR.md`.
 */
export const PRIVACY_CONTACT_EMAIL: string =
    import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || "privacidade@seu-dominio.com.br"
