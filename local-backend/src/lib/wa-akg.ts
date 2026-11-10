/**
 * Stub do cliente WA-AKG para o backend local.
 *
 * O envio e o download de mídia do WhatsApp ficam no backend do servidor
 * (repositório privado). No computador da loja o processamento é local e as
 * respostas saem pela ponte/relay do servidor.
 */
export class WaAkgClient {
  get isConfigured() {
    return false;
  }

  get sessionId(): string | null {
    return null;
  }

  async sendText(_remoteJid: string, _text: string): Promise<{ payload: unknown; providerMessageId: string | null }> {
    throw new Error("O envio direto do WhatsApp não está disponível no backend local.");
  }

  async getSession(): Promise<unknown> {
    throw new Error("A sessão do WhatsApp não está disponível no backend local.");
  }

  async downloadAudio(_messageId: string, _mediaUrl?: string | null): Promise<Uint8Array> {
    throw new Error("O áudio do WhatsApp não está disponível no backend local.");
  }

  async downloadMedia(_messageId: string, _mediaUrl?: string | null): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    throw new Error("A mídia do WhatsApp não está disponível no backend local.");
  }
}
