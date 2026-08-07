import privacyPolicyMarkdown from "@/legal/privacy-policy.md?raw"
import { LegalDocumentPage } from "@/pages/legal/LegalDocumentPage"
import { PRIVACY_CONTACT_EMAIL } from "@/config/privacy"

// O markdown é a fonte única de verdade (`src/legal/*.md`), mas o endereço
// de privacidade é configurável por deploy (issue #155) — o placeholder
// `{{PRIVACY_CONTACT_EMAIL}}` no texto é substituído aqui pelo valor real,
// em vez de duplicar o documento inteiro por variação de endereço.
const markdown = privacyPolicyMarkdown.replaceAll("{{PRIVACY_CONTACT_EMAIL}}", PRIVACY_CONTACT_EMAIL)

export const PrivacyPolicyPage = () => (
    <LegalDocumentPage title="Política de Privacidade" markdown={markdown} />
)
