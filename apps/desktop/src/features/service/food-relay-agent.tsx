import { useEffect } from "react";

import { audioToWav } from "@/lib/audio";
import {
  acknowledgeFoodRelayMessage,
  getFoodRelayAudio,
  getFoodRelayMessages,
  getFoodProducts,
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
        const blockedConversations = new Set<string>();
        const catalog = pending.some(message => message.mediaType === "audio")
          ? await getFoodProducts({ activeOnly: true }).catch(() => []) : [];
        const vocabulary = catalog.filter(product => product.productionMode !== "ingredient")
          .slice(0, 40).map(product => [product.name, ...product.variants.map(variant => variant.name)].join(", ")).join("; ").slice(0, 1200);
        for (const relayMessage of pending) {
          if (disposed) return;
          const conversationKey = `${relayMessage.sessionId}:${relayMessage.remoteJid}`;
          if (blockedConversations.has(conversationKey)) continue;
          try {
            let text = relayMessage.body?.trim() || "";
            if (relayMessage.mediaType === "audio" && !text) {
              const audio = await getFoodRelayAudio(relayMessage.id);
              const transcription = await transcribeFoodAudio(
                await audioToWav(audio),
                `Conversa em português de uma lanchonete: pedidos, sabores, quantidades, retirada, entrega e endereço. Vocabulário do cardápio: ${vocabulary}. Transcreva somente a fala, preservando negativas e correções.`,
              );
              if (!transcription.available) throw new Error("A transcrição local está temporariamente indisponível.");
              text = transcription.understood ? transcription.text?.trim() || "" : "";
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
            if (local.errors?.length) throw new Error("O atendimento local não concluiu o processamento.");

            for (const reply of local.replies || []) {
              await sendFoodRelayMessage(reply.remoteJid, reply.body);
            }
            await acknowledgeFoodRelayMessage(relayMessage.id);
          } catch (error) {
            blockedConversations.add(conversationKey);
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
