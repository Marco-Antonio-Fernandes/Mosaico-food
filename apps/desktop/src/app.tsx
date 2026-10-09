import { useState } from "react";
import { Bell, Boxes, ClipboardList, Cloud, FileText, Gauge, Headset, Package, Settings, ShoppingBasket, UsersRound, WalletCards, Wand2 } from "lucide-react";
import { AppShell, type NavigationItem } from "@/components/shared/app-shell";
import { FoodOverviewPage } from "@/components/shared/food-overview-page";
import { FoodPrototype, type FoodModule } from "@/features/prototype/food-prototype";

type ViewId = "dashboard" | FoodModule;
const navigationItems: NavigationItem<ViewId>[] = [
  { id: "dashboard", label: "Visão geral", group: "Operação", icon: Gauge },
  { id: "pos", label: "PDV", group: "Operação", icon: ShoppingBasket },
  { id: "orders", label: "Pedidos", group: "Operação", icon: ClipboardList },
  { id: "service", label: "Atendimento", group: "Operação", icon: Headset },
  { id: "products", label: "Produtos", group: "Gestão", icon: Package },
  { id: "inventory", label: "Estoque", group: "Gestão", icon: Boxes },
  { id: "customers", label: "Clientes e crediário", group: "Gestão", icon: UsersRound },
  { id: "finance", label: "Caixa e financeiro", group: "Gestão", icon: WalletCards },
  { id: "fiscal", label: "Fiscal", group: "Gestão", icon: FileText },
  { id: "automation", label: "Automação", group: "Sistema", icon: Wand2 },
  { id: "offline", label: "Offline", group: "Sistema", icon: Cloud },
  { id: "settings", label: "Configurações", group: "Sistema", icon: Settings },
];
export function App() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  return <AppShell activeView={activeView} navigationItems={navigationItems} onNavigate={setActiveView} topAction={<button aria-current={activeView === "notifications" ? "page" : undefined} aria-label="Abrir notificações" className={`relative flex size-11 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:ring-brand-500 ${activeView === "notifications" ? "border-orange-300/40 bg-brand-50 text-brand-700" : "border-line bg-canvas text-muted hover:bg-white/[0.06] hover:text-ink"}`} onClick={() => setActiveView("notifications")} type="button"><Bell aria-hidden="true" size={19} /><span aria-hidden="true" className="absolute right-2 top-2 size-2 rounded-full bg-orange-400 ring-2 ring-surface" /><span className="sr-only">Há notificações novas</span></button>} connectionStatus={<span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-xs font-semibold text-amber-100">Demonstração · dados mockados</span>}>
    {activeView === "dashboard" ? <><div className="prototype"><p className="proto-demo">PRÉVIA VISUAL · Indicadores fictícios. Nenhuma consulta ou gravação na API.</p></div><FoodOverviewPage onOpenNotifications={() => setActiveView("notifications")} /></> : <FoodPrototype key={activeView} module={activeView} />}
  </AppShell>;
}
