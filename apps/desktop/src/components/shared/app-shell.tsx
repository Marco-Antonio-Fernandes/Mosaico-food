import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { MosaicoAccount } from "@/components/shared/account-context";

export interface NavigationItem<T extends string> {
  id: T;
  label: string;
  group: string;
  icon: LucideIcon;
}

interface AppShellProps<T extends string> {
  activeView: T;
  navigationItems: NavigationItem<T>[];
  onNavigate: (view: T) => void;
  connectionStatus: ReactNode;
  topAction?: ReactNode;
  sidebarActions?: ReactNode;
  account: MosaicoAccount | null;
  onEditAccount: () => void;
  children: ReactNode;
}

export function AppShell<T extends string>({
  activeView,
  navigationItems,
  onNavigate,
  connectionStatus,
  topAction,
  sidebarActions,
  account,
  onEditAccount,
  children,
}: AppShellProps<T>) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("mosaico-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleSidebar = () => setSidebarCollapsed(current => {
    const next = !current;
    try { window.localStorage.setItem("mosaico-sidebar-collapsed", next ? "1" : "0"); } catch { /* preferência visual opcional */ }
    return next;
  });
  const groups = navigationItems.reduce<Record<string, NavigationItem<T>[]>>(
    (result, item) => {
      const groupItems = result[item.group] ?? [];
      groupItems.push(item);
      result[item.group] = groupItems;
      return result;
    },
    {},
  );

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className={`mosaic-sidebar sticky top-0 h-dvh hidden shrink-0 border-r border-line bg-surface px-4 py-5 lg:flex lg:flex-col ${sidebarCollapsed ? "w-20 is-collapsed" : "w-64 xl:w-72"}`}>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mosaic-sidebar-topbar">
              <div className="mosaic-sidebar-brand px-1 pt-1">
                <p className="text-base font-bold tracking-tight text-ink">Mosaico Food</p>
                <p className="mt-1 text-xs font-medium text-orange-200">Operação da loja</p>
              </div>
              <button className="mosaic-sidebar-toggle" type="button" onClick={toggleSidebar} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}>
                {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
                <span>{sidebarCollapsed ? "Expandir" : "Recolher"}</span>
              </button>
            </div>

            {sidebarActions && <div className="mosaic-quick-actions">{sidebarActions}</div>}

            <nav className={`mt-7 min-h-0 flex-1 overflow-y-auto pr-1 ${sidebarCollapsed ? "space-y-2" : "space-y-6"}`} aria-label="Navegação principal">
              {Object.entries(groups).map(([group, items], index) => {
                const isCollapsed = collapsedGroups[group] ?? false;
                const sectionId = `navigation-group-${index}`;
                return (
                  <section key={group}>
                    <button
                      aria-controls={sectionId}
                      aria-expanded={!isCollapsed}
                      className="mosaic-menu-group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-muted transition"
                      onClick={() => setCollapsedGroups(current => ({ ...current, [group]: !isCollapsed }))}
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        {group}
                        {isCollapsed && items.some(item => item.id === activeView) && <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-400" />}
                      </span>
                      <ChevronDown aria-hidden="true" className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`} size={15} />
                    </button>
                    <div id={sectionId} className={`mt-1 space-y-1 ${isCollapsed ? "hidden" : ""}`}>
                      {items.map(item => {
                        const Icon = item.icon;
                        const isActive = item.id === activeView;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`mosaic-menu-item group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${isActive ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-white/[0.06] hover:text-ink"}`}
                            aria-current={isActive ? "page" : undefined}
                            title={sidebarCollapsed ? item.label : undefined}
                            onClick={() => onNavigate(item.id)}
                          >
                            <Icon aria-hidden="true" className={isActive ? "text-brand-600" : "text-muted"} size={18} strokeWidth={2} />
                            <span className="flex-1">{item.label}</span>
                            <ChevronRight aria-hidden="true" className={`transition-transform ${isActive ? "translate-x-0 text-brand-500" : "-translate-x-1 text-transparent group-hover:translate-x-0 group-hover:text-white/30"}`} size={15} />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mosaic-header relative flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <button type="button" className="mosaic-account-trigger" onClick={onEditAccount} aria-label={account ? `Editar conta ${account.name}` : "Configurar conta da empresa"}>
            <span className="mosaic-account-avatar"><Building2 size={17} aria-hidden="true" /></span>
            <span className="mosaic-account-copy"><small>Conta ativa</small><strong>{account?.name ?? "Configurar empresa"}</strong></span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">{topAction}{connectionStatus}</div>
        </header>

        <nav className="grid grid-cols-2 gap-2 border-b border-line bg-surface px-3 py-3 lg:hidden sm:grid-cols-4 sm:px-6" aria-label="Navegação rápida">
          {navigationItems.slice(0, 4).map(item => {
            const Icon = item.icon;
            const isActive = item.id === activeView;
            return <button key={item.id} type="button" className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${isActive ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-white/[0.06] hover:text-ink"}`} aria-current={isActive ? "page" : undefined} onClick={() => onNavigate(item.id)}><Icon aria-hidden="true" size={15} /><span>{item.label}</span></button>;
          })}
          <details className="mosaic-mobile-more col-span-full">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted hover:bg-white/[0.06] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">Mais <ChevronDown aria-hidden="true" size={15} /></summary>
            <div className="mosaic-mobile-more-menu mt-2 grid gap-1 rounded-xl border border-line bg-surface p-2 sm:grid-cols-2">
              {navigationItems.slice(4).map(item => {
                const Icon = item.icon;
                const isActive = item.id === activeView;
                return <button key={item.id} type="button" aria-current={isActive ? "page" : undefined} className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold ${isActive ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-white/[0.06] hover:text-ink"}`} onClick={() => onNavigate(item.id)}><Icon aria-hidden="true" size={16} />{item.label}</button>;
              })}
            </div>
          </details>
        </nav>

        <main className="min-w-0 flex-1 px-3 py-3 sm:px-5 sm:py-4 xl:px-6"><div className="mx-auto w-full max-w-none">{children}</div></main>
      </div>
    </div>
  );
}
