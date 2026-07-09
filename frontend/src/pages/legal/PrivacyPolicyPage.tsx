import privacyPolicyMarkdown from "@/legal/privacy-policy.md?raw"
import { LegalDocumentPage } from "@/pages/legal/LegalDocumentPage"

export const PrivacyPolicyPage = () => (
    <LegalDocumentPage title="Política de Privacidade" markdown={privacyPolicyMarkdown} />
)
