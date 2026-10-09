import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";



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
  children: ReactNode;
}

export function AppShell<T extends string>({
  activeView,
  navigationItems,
  onNavigate,
  connectionStatus,
  topAction,
  children,
}: AppShellProps<T>) {
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
      <aside className="mosaic-sidebar sticky top-0 h-dvh hidden w-64 xl:w-72 shrink-0 border-r border-line bg-surface px-4 py-5 lg:flex lg:flex-col">
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="px-1 pt-1">
              <p className="text-base font-bold tracking-tight text-ink">Mosaico Food</p>
              <p className="mt-1 text-xs font-medium text-orange-200">Operação da loja</p>
            </div>

            <nav className="mt-7 min-h-0 flex-1 space-y-7 overflow-y-auto pr-1" aria-label="Navegação principal">
              {Object.entries(groups).map(([group, items]) => (
                <div key={group}>
                  <p className="px-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted">
                    {group}
                  </p>
                  <div className="mt-2 space-y-1">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.id === activeView;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`mosaic-menu-item group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                            isActive
                              ? "bg-brand-50 text-brand-700"
                              : "text-muted hover:bg-white/[0.06] hover:text-ink"
                          }`}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => onNavigate(item.id)}
                        >
                          <Icon
                            aria-hidden="true"
                            className={isActive ? "text-brand-600" : "text-muted"}
                            size={18}
                            strokeWidth={2}
                          />
                          <span className="flex-1">{item.label}</span>
                          <ChevronRight
                            aria-hidden="true"
                            className={`transition-transform ${
                              isActive
                                ? "translate-x-0 text-brand-500"
                                : "-translate-x-1 text-transparent group-hover:translate-x-0 group-hover:text-white/30"
                            }`}
                            size={15}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur sm:px-8">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-200">
              <span className="size-1.5 rounded-full bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.9)]" />
              Mosaico Food
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              Gestão da loja
            </p>
          </div>
          <div className="flex items-center gap-3">
            {topAction}
            {connectionStatus}
          </div>
        </header>

        <nav
          className="grid grid-cols-2 gap-2 border-b border-line bg-surface px-3 py-3 sm:grid-cols-4 lg:hidden sm:px-6"
          aria-label="Navegação rápida"
        >
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeView;

            return (
              <button
                key={item.id}
                type="button"
                className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-muted hover:bg-white/[0.06] hover:text-ink"
                }`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon aria-hidden="true" size={15} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6 xl:px-6">
          <div className="mx-auto w-full max-w-none">{children}</div>
        </main>
      </div>
    </div>
  );
}
