import { useEffect, useRef, useState } from "react";
import { Bell, Boxes, ClipboardList, Cloud, FileText, Gauge, Headset, Package, Settings, UsersRound, WalletCards, CreditCard } from "lucide-react";
import { AppShell, type NavigationItem } from "@/components/shared/app-shell";
import { FoodOverviewPage } from "@/components/shared/food-overview-page";
import { FoodPrototype, type FoodModule } from "@/features/prototype/food-prototype";
import { confirmFoodStockNotification, dismissFoodStockNotification, getFoodNotifications, getFoodStockNotifications, type FoodNotification, type FoodStockNotification } from "@/lib/food-api";
import { NotificationList, type NotificationEntry } from "@/components/shared/prototype-kit";
import { FoodAssistant } from "@/features/assistant/food-assistant";
import { OrderAlerts } from "@/features/assistant/order-alerts";
import { ConnectionStatus, type DesktopConnectionStatus } from "@/components/shared/connection-status";
import { FoodRelayAgent } from "@/features/service/food-relay-agent";

type ViewId = FoodModule;
const navigationItems: NavigationItem<ViewId>[] = [
  { id: "orders", label: "Pedidos", group: "Operação", icon: ClipboardList },
  { id: "service", label: "Atendimento", group: "Operação", icon: Headset },
  { id: "credit", label: "Crediário", group: "Operação", icon: CreditCard },
  { id: "products", label: "Produtos", group: "Gestão", icon: Package },
  { id: "inventory", label: "Estoque", group: "Gestão", icon: Boxes },
  { id: "customers", label: "Clientes", group: "Gestão", icon: UsersRound },
  { id: "finance", label: "Caixa e financeiro", group: "Gestão", icon: WalletCards },
  { id: "fiscal", label: "Fiscal", group: "Gestão", icon: FileText },
  { id: "backup", label: "Backup", group: "Sistema", icon: Cloud },
  { id: "settings", label: "Configurações", group: "Sistema", icon: Settings },
];

let foodAudioContext: AudioContext | null = null;

function playFoodNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext;
    foodAudioContext ??= new AudioContextClass();
    const context = foodAudioContext;
    const play = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.setValueAtTime(1174, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.26);
    };
    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    // Audio is only an enhancement; the in-app and system notifications remain available.
  }
}

function showFoodDesktopNotification(notification: NotificationEntry) {
  if (!("Notification" in window)) return;
  const show = () => {
    if (Notification.permission === "granted") {
      new Notification(notification.title, { body: notification.body, tag: notification.id });
    }
  };
  if (Notification.permission === "default") void Notification.requestPermission().then(show).catch(() => undefined);
  else show();
}

function toNotificationEntry(notification: FoodNotification): NotificationEntry {
  return {
    id: notification.id,
    title: `WhatsApp · ${notification.customerName}`,
    body: notification.body || "Nova mensagem recebida.",
    createdAt: notification.createdAt,
    priority: notification.automationPaused ? "urgent" : "high",
  };
}

function toStockNotificationEntry(notification: FoodStockNotification): NotificationEntry {
  return {
    id: notification.id,
    kind: "stock",
    title: "Confirmar baixa de insumo",
    body: `Você vendeu produtos suficientes para consumir ${notification.quantity} unidade${notification.quantity === 1 ? "" : "s"} de ${notification.ingredientName} no preparo de ${notification.productName}. O rendimento cadastrado é de ${notification.yieldQuantity} produtos por unidade. Deseja remover do estoque?`,
    createdAt: notification.createdAt,
    priority: "high",
  };
}

export function App() {
  const [activeView, setActiveView] = useState<ViewId>("orders");
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<DesktopConnectionStatus>({ state: "unknown", label: "Iniciando Food local" });
  const [whatsappStatus, setWhatsappStatus] = useState<DesktopConnectionStatus>({ state: "unknown", label: "WhatsApp remoto iniciando" });
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const notificationCursorRef = useRef(new Date(Date.now() - 15_000).toISOString());
  const seenNotificationIdsRef = useRef(new Set<string>());
  const notificationPollInitializedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const cursor = new Date(new Date(notificationCursorRef.current).getTime() - 15_000).toISOString();
        const [incomingWhatsapp, incomingStock] = await Promise.all([getFoodNotifications(cursor), getFoodStockNotifications()]);
        if (!active) return;
        const incomingEntries = [...incomingWhatsapp.map(toNotificationEntry), ...incomingStock.map(toStockNotificationEntry)];
        const unseen = incomingEntries.filter(notification => !seenNotificationIdsRef.current.has(notification.id));
        incomingEntries.forEach(notification => seenNotificationIdsRef.current.add(notification.id));
        const newest = incomingWhatsapp.reduce((latest, notification) => Math.max(latest, new Date(notification.createdAt).getTime()), 0);
        notificationCursorRef.current = new Date(Math.max(Date.now(), newest)).toISOString();

        if (!notificationPollInitializedRef.current) {
          notificationPollInitializedRef.current = true;
          const initialStockEntries = incomingStock.map(toStockNotificationEntry);
          if (initialStockEntries.length) setNotifications(current => [...initialStockEntries, ...current].slice(0, 50));
          return;
        }
        if (!unseen.length) return;

        const entries = unseen;
        setNotifications(current => [...entries, ...current].slice(0, 50));
        setUnreadNotifications(current => current + entries.length);
        entries.forEach(entry => {
          playFoodNotificationSound();
          showFoodDesktopNotification(entry);
        });
      } catch {
        // The service panel continues to show the last state while the backend is unavailable.
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onRelayStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string; label?: string; message?: string }>).detail;
      const state: DesktopConnectionStatus["state"] = detail?.state === "online" ? "online" : detail?.state === "offline" ? "offline" : "unknown";
      const label = detail?.label || (state === "online" ? "WhatsApp remoto conectado" : "WhatsApp remoto aguardando status");
      setWhatsappStatus({ state, label });
    };
    window.addEventListener("food-relay-status", onRelayStatus);
    return () => window.removeEventListener("food-relay-status", onRelayStatus);
  }, []);

  useEffect(() => {
    const openOrders = () => {
      setActiveView("orders");
      setOverviewOpen(false);
      setNotificationsOpen(false);
    };
    window.addEventListener("food-open-orders", openOrders);
    return () => window.removeEventListener("food-open-orders", openOrders);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const status = await window.mosaicoDesktop?.getConnectionStatus().catch(() => undefined);
      if (active && status) setConnectionStatus(status);
      else if (active && !window.mosaicoDesktop) setConnectionStatus({ state: "online", label: "Modo navegador" });
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const openNotifications = () => {
    setNotificationsOpen(true);
    setOverviewOpen(false);
    setUnreadNotifications(0);
  };

  const openOverview = () => {
    setOverviewOpen(true);
    setNotificationsOpen(false);
  };

  const navigate = (view: ViewId) => {
    setActiveView(view);
    setOverviewOpen(false);
    setNotificationsOpen(false);
  };

  const confirmStockNotification = async (id: string) => {
    await confirmFoodStockNotification(id);
    setNotifications(current => current.filter(notification => notification.id !== id));
  };

  const dismissStockNotification = async (id: string) => {
    await dismissFoodStockNotification(id);
    setNotifications(current => current.filter(notification => notification.id !== id));
  };

  return <AppShell activeView={activeView} navigationItems={navigationItems} onNavigate={navigate} topAction={<div className="flex items-center gap-2"><ConnectionStatus status={whatsappStatus} /><button aria-pressed={overviewOpen} aria-label="Abrir visão geral" className={`relative flex size-11 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:ring-brand-500 ${overviewOpen ? "border-orange-300/40 bg-brand-50 text-brand-700" : "border-line bg-canvas text-muted hover:bg-white/[0.06] hover:text-ink"}`} onClick={() => overviewOpen ? setOverviewOpen(false) : openOverview()} type="button"><Gauge aria-hidden="true" size={19} /><span className="sr-only">Visão geral</span></button><button aria-pressed={notificationsOpen} aria-label="Abrir notificações" className={`relative flex size-11 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:ring-brand-500 ${notificationsOpen ? "border-orange-300/40 bg-brand-50 text-brand-700" : "border-line bg-canvas text-muted hover:bg-white/[0.06] hover:text-ink"}`} onClick={() => notificationsOpen ? setNotificationsOpen(false) : openNotifications()} type="button"><Bell aria-hidden="true" size={19} />{unreadNotifications > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-orange-400 px-1 text-[10px] font-bold text-slate-950">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}<span className="sr-only">{unreadNotifications ? `${unreadNotifications} notificações novas` : "Abrir notificações"}</span></button></div>} connectionStatus={<ConnectionStatus status={connectionStatus} />}>
    <FoodRelayAgent />
    {connectionStatus.state === "offline" && <div className="mosaic-system-alert" role="alert">{connectionStatus.label}. Avise o suporte técnico.</div>}
    <FoodPrototype key={activeView} module={activeView} />
    {overviewOpen && <div className="mosaic-top-popover mosaic-overview-popover"><FoodOverviewPage onOpenNotifications={openNotifications} /></div>}
    {notificationsOpen && <div className="mosaic-top-popover mosaic-notifications-popover"><NotificationList notifications={notifications} onReadAll={() => setUnreadNotifications(0)} onConfirmStock={confirmStockNotification} onDismissStock={dismissStockNotification} /></div>}
    <FoodAssistant />
    <OrderAlerts onOpen={() => navigate("orders")} />
  </AppShell>;
}
