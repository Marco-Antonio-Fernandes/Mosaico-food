import { useEffect, useRef, useState } from "react";
import { getFoodOrders, type FoodOrder } from "@/lib/food-api";

export function OrderAlerts({ onOpen }: { onOpen: () => void }) {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const lastPing = useRef(0);
  const lastStages = useRef("");
  useEffect(() => {
    let alive = true, polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try { const result = await getFoodOrders("active"); if (alive) setOrders(result); }
      catch { /* Keep the last visible queue while disconnected. */ }
      finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(() => { setNow(Date.now()); void poll(); }, 5000);
    return () => { alive = false; window.clearInterval(timer); void context.current?.close(); context.current = null; };
  }, []);
  const oldest = orders.reduce((age, order) => Math.max(age, now - new Date(order.updatedAt).getTime()), 0);
  const interval = oldest >= 10 * 60000 ? 15000 : oldest >= 5 * 60000 ? 30000 : 60000;
  const urgent = oldest >= 5 * 60000;
  useEffect(() => {
    if (!orders.length || !sound || !context.current || context.current.state !== "running") return;
    const stages = orders.map(order => `${order.id}:${order.status}`).sort().join("|");
    if (stages === lastStages.current && now - lastPing.current < interval) return;
    lastStages.current = stages; lastPing.current = now;
    const audio = context.current;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.frequency.value = urgent ? 1100 : 880;
    gain.gain.setValueAtTime(0.001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + .02);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + .3);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .31);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }, [orders, now, interval, sound, urgent]);
  async function toggle() {
    if (sound) { setSound(false); return; }
    try {
      context.current ??= new AudioContext(); await context.current.resume();
      setSound(context.current.state === "running");
    } catch { setSound(false); }
  }
  return <aside className={`food-order-alert ${urgent ? "is-urgent" : ""}`} aria-label="Acompanhamento de pedidos">
    {orders.length > 0 && <button type="button" onClick={onOpen}><span className="food-order-ping" aria-hidden="true" />{orders.length} pedido(s) em andamento · {Math.floor(oldest / 60000)} min na etapa mais antiga</button>}
    <button type="button" onClick={() => void toggle()} aria-pressed={sound}>{sound ? "Silenciar pedidos" : "Ativar som dos pedidos"}</button>
  </aside>;
}
