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
  { id: "notifications", label: "Notificações", group: "Sistema", icon: Bell },
  { id: "automation", label: "Automação", group: "Sistema", icon: Wand2 },
  { id: "offline", label: "Offline", group: "Sistema", icon: Cloud },
  { id: "settings", label: "Configurações", group: "Sistema", icon: Settings },
];
export function App() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  return <AppShell activeView={activeView} navigationItems={navigationItems} onNavigate={setActiveView} connectionStatus={<span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-xs font-semibold text-amber-100">Demonstração · dados mockados</span>}>
    {activeView === "dashboard" ? <><div className="prototype"><p className="proto-demo">PRÉVIA VISUAL · Indicadores fictícios. Nenhuma consulta ou gravação na API.</p></div><FoodOverviewPage onOpenNotifications={() => setActiveView("notifications")} /></> : <FoodPrototype key={activeView} module={activeView} />}
  </AppShell>;
}
