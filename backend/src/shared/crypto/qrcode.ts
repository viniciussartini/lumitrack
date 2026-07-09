import QRCode from "qrcode"

// Gera o QR code do setup de MFA como data URL (PNG base64) — o frontend
// só precisa renderizar uma <img src="...">, sem nenhuma lib de QR no cliente.
export async function generateQrCodeDataUrl(uri: string): Promise<string> {
    return QRCode.toDataURL(uri)
}
