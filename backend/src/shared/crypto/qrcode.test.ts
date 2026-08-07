import { describe, it, expect } from "vitest"
import { generateQrCodeDataUrl } from "@/shared/crypto/qrcode.js"

describe("generateQrCodeDataUrl", () => {
    it("gera uma data URL PNG válida a partir de uma URI otpauth", async () => {
        const dataUrl = await generateQrCodeDataUrl(
            "otpauth://totp/LumiTrack:test@example.com?secret=ABC&issuer=LumiTrack",
        )

        expect(dataUrl).toMatch(/^data:image\/png;base64,/)
    })
})
