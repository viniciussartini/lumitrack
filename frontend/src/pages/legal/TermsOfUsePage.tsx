import termsOfUseMarkdown from "@/legal/terms-of-use.md?raw"
import { LegalDocumentPage } from "@/pages/legal/LegalDocumentPage"

export const TermsOfUsePage = () => (
    <LegalDocumentPage title="Termos de Uso" markdown={termsOfUseMarkdown} />
)
