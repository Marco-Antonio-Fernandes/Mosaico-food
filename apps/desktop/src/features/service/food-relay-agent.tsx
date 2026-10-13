import { useEffect } from "react";

import { audioToWav } from "@/lib/audio";
import {
  acknowledgeFoodRelayMessage,
  getFoodRelayAudio,
  getFoodRelayMessages,
  getFoodRemoteWhatsappStatus,
  ingestFoodRelayMessage,
  sendFoodRelayMessage,
  transcribeFoodAudio,
} from "@/lib/food-api";

export function FoodRelayAgent() {
  useEffect(() => {
    let disposed = false;
    let draining = false;

    const drainRelay = async () => {
      if (draining) return;
      draining = true;
      try {
        const remoteStatus = await getFoodRemoteWhatsappStatus();
        window.dispatchEvent(new CustomEvent("food-relay-status", { detail: remoteStatus }));
        const pending = await getFoodRelayMessages();
        for (const relayMessage of pending) {
          if (disposed) return;
          try {
            let text = relayMessage.body?.trim() || "";
            if (relayMessage.mediaType === "audio" && !text) {
              const audio = await getFoodRelayAudio(relayMessage.id);
              const transcription = await transcribeFoodAudio(
                await audioToWav(audio),
                "Áudio de cliente do Mosaico Food. Preserve nomes de produtos, quantidades, vendas, compras, preparos, perdas e dúvidas.",
              );
              if (!transcription.understood || !transcription.text?.trim()) throw new Error("Não consegui entender o áudio do atendimento.");
              text = transcription.text.trim();
            }

            const local = await ingestFoodRelayMessage({
              providerMessageId: relayMessage.providerMessageId,
              sessionId: relayMessage.sessionId,
              remoteJid: relayMessage.remoteJid,
              customerName: relayMessage.customerName,
              body: text || null,
              mediaType: relayMessage.mediaType,
              createdAt: relayMessage.createdAt,
            });

            for (const reply of local.replies || []) {
              await sendFoodRelayMessage(reply.remoteJid, reply.body);
            }
            await acknowledgeFoodRelayMessage(relayMessage.id);
          } catch (error) {
            console.error("[Mosaico Food] Falha ao processar mensagem da ponte", error);
            // Uma mídia indisponível não significa que a sessão do WhatsApp caiu.
            // Deixe a mensagem pendente para tentar novamente no próximo ciclo e
            // continue processando as próximas mensagens da fila.
          }
        }
      } catch (error) {
        console.error("[Mosaico Food] Ponte do WhatsApp indisponível", error);
        window.dispatchEvent(new CustomEvent("food-relay-status", {
          detail: {
            state: "unknown",
            label: "Reconectando WhatsApp remoto…",
          },
        }));
      } finally {
        draining = false;
      }
    };

    void drainRelay();
    const timer = window.setInterval(() => void drainRelay(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
