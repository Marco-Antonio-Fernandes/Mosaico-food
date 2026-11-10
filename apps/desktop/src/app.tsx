import { useEffect, useRef, useState } from "react";
import { Bell, Boxes, ClipboardList, FileText, Headset, LayoutDashboard, Package, Settings, UsersRound, WalletCards, CreditCard } from "lucide-react";
import { AppShell, type NavigationItem } from "@/components/shared/app-shell";
import { AccountSetupModal } from "@/components/shared/account-setup-modal";
import { loadMosaicoAccount, normalizeCnpj, persistMosaicoAccount, type MosaicoAccount } from "@/components/shared/account-context";
import { FoodPrototype, type FoodModule } from "@/features/prototype/food-prototype";
import { confirmFoodStockNotification, dismissFoodStockNotification, getFoodNotifications, getFoodOrders, getFoodProducts, getFoodStockNotifications, type FoodNotification, type FoodOrder, type FoodProduct, type FoodStockNotification, upsertMosaicoAccount } from "@/lib/food-api";
import { NotificationList, type NotificationEntry } from "@/components/shared/prototype-kit";
import { FoodAssistant } from "@/features/assistant/food-assistant";
import { OrderAlerts } from "@/features/assistant/order-alerts";
import { FoodOverviewPage } from "@/components/shared/food-overview-page";
import { ConnectionStatus, type DesktopConnectionStatus } from "@/components/shared/connection-status";
import { FoodRelayAgent } from "@/features/service/food-relay-agent";
import { FoodPrinterAgent } from "@/features/service/food-printer-agent";

type ViewId = FoodModule;
const navigationItems: NavigationItem<ViewId>[] = [
  { id: "orders", label: "Pedidos", group: "Operação", icon: ClipboardList },
  { id: "service", label: "Atendimento", group: "Operação", icon: Headset },
  { id: "credit", label: "Crediário", group: "Operação", icon: CreditCard },
  { id: "products", label: "Produtos", group: "Gestão", icon: Package },
  { id: "inventory", label: "Estoque", group: "Gestão", icon: Boxes },
  { id: "customers", label: "Clientes", group: "Gestão", icon: UsersRound },
  { id: "finance", label: "Caixa", group: "Gestão", icon: WalletCards },
  { id: "fiscal", label: "Fiscal", group: "Gestão", icon: FileText },
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
    kind: "whatsapp",
    title: "O bot não conseguiu responder",
    body: `${notification.customerName} está esperando. Abra a mensagem e responda no WhatsApp agora.`,
    createdAt: notification.createdAt,
    priority: "urgent",
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

function toOrderDelayEntry(order: FoodOrder, now: number): NotificationEntry | null {
  const age = now - new Date(order.updatedAt).getTime();
  if (age < 5 * 60_000) return null;
  const stage = order.status === "out_for_delivery" ? "em trânsito" : order.status === "ready" ? "pronto" : "em preparo";
  const level = Math.floor(age / (5 * 60_000));
  return {
    id: `order-delay:${order.id}:${level}`,
    title: level >= 2 ? "Pedido muito atrasado" : "Pedido demorando",
    body: `O pedido de ${order.customerName || order.customer?.name || "cliente"} está há ${Math.floor(age / 60_000)} minutos ${stage}. Confira a operação.`,
    createdAt: order.updatedAt,
    priority: level >= 2 ? "urgent" : "high",
  };
}

function toLowStockEntry(product: FoodProduct): NotificationEntry | null {
  if (!product.active || product.productionMode === "ingredient" || product.productionMode === "made_here") return null;
  const available = product.productionMode === "recipe" ? product.saleCapacity : product.stockQuantity + product.unpreparedQuantity;
  if (available <= 0 || available > 2) return null;
  return {
    id: `low-stock:${product.id}:${available}`,
    title: "Produto acabando",
    body: `${product.productName || product.name}${product.flavor ? ` · ${product.flavor}` : ""} tem apenas ${available} unidade${available === 1 ? "" : "s"} disponível${available === 1 ? "" : "eis"}.`,
    createdAt: product.updatedAt,
    priority: "high",
  };
}

export function App() {
  const [activeView, setActiveView] = useState<ViewId>("orders");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [account, setAccount] = useState<MosaicoAccount | null>(() => loadMosaicoAccount());
  const [accountSetupOpen, setAccountSetupOpen] = useState(() => {
    const current = loadMosaicoAccount();
    return current === null || normalizeCnpj(current.document).length !== 14;
  });
  const [connectionStatus, setConnectionStatus] = useState<DesktopConnectionStatus>({ state: "unknown", label: "Iniciando Food local" });
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
        const [whatsappResult, stockResult, ordersResult, productsResult] = await Promise.allSettled([getFoodNotifications(cursor), getFoodStockNotifications(), getFoodOrders("active"), getFoodProducts({ activeOnly: true })]);
        if (!active) return;
        const incomingWhatsapp = whatsappResult.status === "fulfilled" ? whatsappResult.value : [];
        const incomingStock = stockResult.status === "fulfilled" ? stockResult.value : [];
        const delayedOrders = ordersResult.status === "fulfilled" ? ordersResult.value.map(order => toOrderDelayEntry(order, Date.now())).filter((entry): entry is NotificationEntry => Boolean(entry)) : [];
        const lowStock = productsResult.status === "fulfilled" ? productsResult.value.map(toLowStockEntry).filter((entry): entry is NotificationEntry => Boolean(entry)) : [];
        const incomingEntries = [
          ...incomingWhatsapp.filter(notification => notification.needsHuman).map(toNotificationEntry),
          ...incomingStock.map(toStockNotificationEntry),
          ...delayedOrders,
          ...lowStock,
        ];
        const dynamicIds = new Set([...delayedOrders, ...lowStock].map(entry => entry.id));
        const activeWhatsappIds = new Set(incomingWhatsapp.filter(notification => notification.needsHuman).map(notification => notification.id));
        setNotifications(current => current.filter(entry => {
          if (entry.kind === "whatsapp") return activeWhatsappIds.has(entry.id);
          return !/^(order-delay|low-stock):/.test(entry.id) || dynamicIds.has(entry.id);
        }));
        const unseen = incomingEntries.filter(notification => !seenNotificationIdsRef.current.has(notification.id));
        incomingEntries.forEach(notification => seenNotificationIdsRef.current.add(notification.id));
        const newest = incomingWhatsapp.reduce((latest, notification) => Math.max(latest, new Date(notification.createdAt).getTime()), 0);
        notificationCursorRef.current = new Date(Math.max(Date.now(), newest)).toISOString();

        if (!notificationPollInitializedRef.current) {
          notificationPollInitializedRef.current = true;
          if (incomingEntries.length) setNotifications(current => [...incomingEntries, ...current].slice(0, 50));
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
    const openOrders = () => {
      setActiveView("orders");
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
    setUnreadNotifications(0);
  };

  const navigate = (view: ViewId) => {
    setActiveView(view);
    setNotificationsOpen(false);
    setDashboardOpen(false);
  };

  const saveAccount = async (next: MosaicoAccount) => {
    const result = await upsertMosaicoAccount({ id: next.id, name: next.name, cnpj: next.document, city: next.city });
    persistMosaicoAccount(next);
    setAccount(next);
    setAccountSetupOpen(false);
    window.dispatchEvent(new CustomEvent("mosaico-account-changed", { detail: next }));
    if (!result.integration.provisioned) {
      console.warn(`[Mosaico Food] Empresa salva, mas a integração fiscal não foi provisionada: ${result.integration.message}`);
    }
  };

  const confirmStockNotification = async (id: string) => {
    await confirmFoodStockNotification(id);
    setNotifications(current => current.filter(notification => notification.id !== id));
  };

  const dismissStockNotification = async (id: string) => {
    await dismissFoodStockNotification(id);
    setNotifications(current => current.filter(notification => notification.id !== id));
  };

  return <>
    <AppShell activeView={activeView} navigationItems={navigationItems} onNavigate={navigate} account={account} onEditAccount={() => setAccountSetupOpen(true)} topAction={<><button aria-pressed={dashboardOpen} aria-label="Abrir dashboard" title="Dashboard" className={`flex size-9 items-center justify-center rounded-lg border transition focus-visible:ring-2 focus-visible:ring-brand-500 ${dashboardOpen ? "border-brand-500/50 bg-brand-50 text-brand-700" : "border-line bg-canvas text-muted hover:bg-white/[0.06] hover:text-ink"}`} onClick={() => setDashboardOpen(current => !current)} type="button"><LayoutDashboard aria-hidden="true" size={17} /></button><button aria-pressed={notificationsOpen} aria-label="Abrir notificações" className={`relative flex size-9 items-center justify-center rounded-lg border transition focus-visible:ring-2 focus-visible:ring-brand-500 ${notificationsOpen ? "border-red-300/50 bg-red-50 text-red-700" : "border-line bg-canvas text-muted hover:bg-white/[0.06] hover:text-ink"}`} onClick={() => notificationsOpen ? setNotificationsOpen(false) : openNotifications()} type="button"><Bell aria-hidden="true" size={17} />{unreadNotifications > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex min-w-4 animate-pulse items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}<span className="sr-only">{unreadNotifications ? `${unreadNotifications} notificações novas` : "Abrir notificações"}</span></button></>} connectionStatus={<ConnectionStatus status={connectionStatus} compact />}>
    <FoodRelayAgent />
    <FoodPrinterAgent />
    {connectionStatus.state === "offline" && <div className="mosaic-system-alert" role="alert">{connectionStatus.label}. Avise o suporte técnico.</div>}
    {dashboardOpen ? <FoodOverviewPage onOpenNotifications={() => { setDashboardOpen(false); openNotifications(); }} /> : <FoodPrototype key={`${account?.id ?? "sem-conta"}:${activeView}`} module={activeView} />}
    {notificationsOpen && <div className="mosaic-top-popover mosaic-notifications-popover"><NotificationList notifications={notifications} onReadAll={() => setUnreadNotifications(0)} onConfirmStock={confirmStockNotification} onDismissStock={dismissStockNotification} /></div>}
    <FoodAssistant />
    <OrderAlerts onOpen={() => navigate("orders")} />
    </AppShell>
    <AccountSetupModal open={accountSetupOpen} account={account} onSave={saveAccount} onClose={account ? () => setAccountSetupOpen(false) : undefined} />
  </>;
}
