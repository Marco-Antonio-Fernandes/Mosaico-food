import { useState } from "react";

import { Panel } from "@/components/shared/prototype-kit";

const STORAGE_KEY = "mosaico-order-sound-enabled";

export function FoodNotificationsPanel() {
  const [enabled, setEnabled] = useState(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });

  const change = async (next: boolean) => {
    setEnabled(next);
    try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* preferência opcional */ }
    if (next) {
      try {
        const context = new AudioContext();
        await context.resume();
        await context.close();
      } catch { /* o som será liberado no primeiro toque */ }
    }
    window.dispatchEvent(new CustomEvent("mosaico-order-sound-changed", { detail: next }));
  };

  return <Panel title="Notificações" subtitle="Som dos pedidos">
    <label className="proto-switch"><span>Som de novo pedido</span><input type="checkbox" checked={enabled} onChange={event => void change(event.target.checked)} /></label>
    <p className="proto-caption">Quando desligado, os pedidos continuam aparecendo na tela e nas notificações, mas sem som.</p>
  </Panel>;
}
