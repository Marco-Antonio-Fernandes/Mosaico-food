import { useEffect, useRef, useState } from "react";
import { getFoodOrders, type FoodOrder } from "@/lib/food-api";

export function OrderAlerts({ onOpen }: { onOpen: () => void }) {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(() => {
    try { return window.localStorage.getItem("mosaico-order-sound-enabled") === "1"; } catch { return false; }
  });
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
  useEffect(() => {
    const onSetting = (event: Event) => {
      const enabled = Boolean((event as CustomEvent<boolean>).detail);
      setSound(enabled);
      if (enabled) {
        context.current ??= new AudioContext();
        void context.current.resume();
      }
    };
    const resume = () => {
      if (sound && context.current?.state === "suspended") void context.current.resume();
    };
    window.addEventListener("mosaico-order-sound-changed", onSetting);
    window.addEventListener("pointerdown", resume);
    return () => {
      window.removeEventListener("mosaico-order-sound-changed", onSetting);
      window.removeEventListener("pointerdown", resume);
    };
  }, [sound]);
  if (!orders.length) return null;
  return <aside className={`food-order-alert ${urgent ? "is-urgent" : ""}`} aria-label="Acompanhamento de pedidos">
    <button type="button" onClick={onOpen}><span className="food-order-ping" aria-hidden="true" />{orders.length} pedido(s) em andamento · {Math.floor(oldest / 60000)} min na etapa mais antiga</button>
  </aside>;
}
