import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MessageCircle,
  Package,
  ShoppingBag,
  Sparkles,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";


type Period = "day" | "week" | "month";

type Metric = {
  label: string;
  value: string;
  comparison: string;
  positive?: boolean;
  icon: LucideIcon;
  color: string;
};

const periodLabels: Record<Period, string> = {
  day: "Hoje",
  week: "Esta semana",
  month: "Este mês",
};

const periodData: Record<Period, { metrics: Metric[]; bars: { label: string; value: number; color: string }[] }> = {
  day: {
    metrics: [
      { label: "Pedidos realizados", value: "42", comparison: "+12% vs. ontem", positive: true, icon: ShoppingBag, color: "orange" },
      { label: "Pessoas atendidas", value: "86", comparison: "+8% vs. ontem", positive: true, icon: UsersRound, color: "cyan" },
      { label: "Faturamento", value: "R$ 1.842", comparison: "+18% vs. ontem", positive: true, icon: WalletCards, color: "emerald" },
      { label: "Ticket médio", value: "R$ 43,85", comparison: "-3% vs. ontem", icon: Sparkles, color: "violet" },
    ],
    bars: [
      { label: "08h", value: 34, color: "bg-cyan-300" },
      { label: "10h", value: 48, color: "bg-orange-300" },
      { label: "12h", value: 86, color: "bg-orange-500" },
      { label: "14h", value: 58, color: "bg-amber-300" },
      { label: "16h", value: 67, color: "bg-emerald-300" },
      { label: "18h", value: 92, color: "bg-rose-300" },
      { label: "20h", value: 72, color: "bg-violet-300" },
    ],
  },
  week: {
    metrics: [
      { label: "Pedidos realizados", value: "238", comparison: "+9% vs. semana passada", positive: true, icon: ShoppingBag, color: "orange" },
      { label: "Pessoas atendidas", value: "514", comparison: "+14% vs. semana passada", positive: true, icon: UsersRound, color: "cyan" },
      { label: "Faturamento", value: "R$ 9.720", comparison: "+11% vs. semana passada", positive: true, icon: WalletCards, color: "emerald" },
      { label: "Ticket médio", value: "R$ 40,84", comparison: "+2% vs. semana passada", positive: true, icon: Sparkles, color: "violet" },
    ],
    bars: [
      { label: "Seg", value: 58, color: "bg-cyan-300" },
      { label: "Ter", value: 68, color: "bg-orange-300" },
      { label: "Qua", value: 45, color: "bg-amber-300" },
      { label: "Qui", value: 74, color: "bg-emerald-300" },
      { label: "Sex", value: 92, color: "bg-orange-500" },
      { label: "Sáb", value: 82, color: "bg-rose-300" },
      { label: "Dom", value: 62, color: "bg-violet-300" },
    ],
  },
  month: {
    metrics: [
      { label: "Pedidos realizados", value: "1.024", comparison: "+16% vs. mês passado", positive: true, icon: ShoppingBag, color: "orange" },
      { label: "Pessoas atendidas", value: "2.210", comparison: "+19% vs. mês passado", positive: true, icon: UsersRound, color: "cyan" },
      { label: "Faturamento", value: "R$ 41.380", comparison: "+13% vs. mês passado", positive: true, icon: WalletCards, color: "emerald" },
      { label: "Ticket médio", value: "R$ 40,41", comparison: "+1% vs. mês passado", positive: true, icon: Sparkles, color: "violet" },
    ],
    bars: [
      { label: "Sem 1", value: 64, color: "bg-cyan-300" },
      { label: "Sem 2", value: 78, color: "bg-orange-300" },
      { label: "Sem 3", value: 58, color: "bg-amber-300" },
      { label: "Sem 4", value: 92, color: "bg-orange-500" },
    ],
  },
};

const metricIconStyles: Record<string, string> = {
  orange: "bg-orange-400/15 text-orange-200 ring-orange-300/20",
  cyan: "bg-cyan-400/15 text-cyan-200 ring-cyan-300/20",
  emerald: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/20",
  violet: "bg-violet-400/15 text-violet-200 ring-violet-300/20",
};

export function FoodOverviewPage({ onOpenNotifications }: { onOpenNotifications?: () => void }) {
  const [period, setPeriod] = useState<Period>("day");
  const [date, setDate] = useState("2026-10-09");
  const data = useMemo(() => periodData[period], [period]);

  return (
    <div className="space-y-5">
      <section className="mosaic-panel relative overflow-hidden rounded-[2rem] border border-orange-300/15 bg-gradient-to-br from-orange-400/[0.15] via-surface to-cyan-400/[0.06] p-5 shadow-panel sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-orange-400/[0.1] blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-orange-200">
              <Sparkles aria-hidden="true" size={14} />
              Visão geral da operação
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              O pulso da sua loja, em um só olhar.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
              Acompanhe o movimento do salão, os pedidos e os sinais que merecem atenção antes que virem problema.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-muted backdrop-blur">
            <div>
              <p className="font-semibold text-ink">Mosaico Food</p>
              <p className="text-xs text-muted">Painel de continuidade</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Leitura operacional</p>
          <h2 className="mt-1 text-xl font-bold text-ink">Movimento da loja</h2>
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center rounded-2xl border border-line bg-surface p-2">
          <label className="sr-only" htmlFor="food-period">Período</label>
          <select
            className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm font-semibold text-ink"
            id="food-period"
            onChange={(event) => setPeriod(event.target.value as Period)}
            value={period}
          >
            {Object.entries(periodLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="food-date">Data de referência</label>
          <input
            aria-label="Data de referência"
            className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm font-semibold text-ink"
            id="food-date"
            onChange={(event) => { if (event.target.value) setDate(period === "month" ? event.target.value + "-01" : event.target.value); }}
            type={period === "month" ? "month" : "date"}
            value={period === "month" ? date.slice(0, 7) : date}
          />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {data.metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="rounded-2xl border border-line bg-surface/90 p-5 shadow-soft" key={metric.label}>
              <div className="flex items-start justify-between gap-3">
                <span className={`flex size-11 items-center justify-center rounded-2xl ring-1 ${metricIconStyles[metric.color]}`}>
                  <Icon aria-hidden="true" size={20} />
                </span>
                <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted">
                  {periodLabels[period]}
                </span>
              </div>
              <p className="mt-6 text-3xl font-bold tracking-tight text-ink">{metric.value}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{metric.label}</p>
              <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${metric.positive ? "text-emerald-300" : "text-amber-200"}`}>
                {metric.positive ? <ArrowUpRight aria-hidden="true" size={14} /> : <ArrowDownRight aria-hidden="true" size={14} />}
                {metric.comparison}
              </p>
            </article>
          );
        })}
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-panel sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Comparativo</p>
              <h2 className="mt-1 text-lg font-bold text-ink">Ritmo de pedidos</h2>
            </div>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-200">+11% no período</span>
          </div>
          <div className="mt-6 flex h-40 sm:h-52 items-end gap-2 border-b border-line px-2 sm:gap-5">
            {data.bars.map((bar) => (
              <div className="flex h-full flex-1 flex-col items-center justify-end gap-3" key={bar.label}>
                <div className="flex h-full w-full items-end">
                  <div className={`w-full rounded-t-xl ${bar.color} shadow-[0_0_24px_rgba(251,146,60,0.12)]`} style={{ height: `${bar.value}%` }} />
                </div>
                <span className="text-[0.68rem] font-semibold text-muted">{bar.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">Dados demonstrativos para validar a hierarquia da visão geral. A API substituirá estes valores.</p>
        </section>

        <section className="mosaic-panel rounded-3xl border border-orange-300/20 bg-gradient-to-br from-orange-400/[0.1] via-surface to-rose-400/[0.05] p-5 shadow-panel sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-200">Atenção agora</p>
              <h2 className="mt-1 text-lg font-bold text-ink">Notificações</h2>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-orange-400/15 text-orange-200"><Sparkles aria-hidden="true" size={17} /></span>
          </div>
          <div className="mt-6 space-y-3">
            <FoodAlert icon={MessageCircle} title="WhatsApp" description="3 atendimentos aguardam resposta." tone="cyan" />
            <FoodAlert icon={ShoppingBag} title="Novo pedido" description="Pedido #1042 precisa de conferência." tone="orange" />
            <FoodAlert icon={Package} title="Estoque" description="2 itens estão próximos do mínimo." tone="amber" />
          </div>
          <button className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-orange-200 transition hover:text-orange-100" type="button" onClick={onOpenNotifications}>
            Ver central de avisos <ChevronRight aria-hidden="true" size={16} />
          </button>
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        <QuickAction icon={Clock3} label="Próximo pico" value="12h–14h" detail="Prepare a equipe do salão" />
        <QuickAction icon={CheckCircle2} label="Operação" value="Estável" detail="Nenhuma ocorrência crítica" />
        <QuickAction icon={CalendarDays} label="Data selecionada" value={date} detail="Use o filtro para comparar períodos" />
      </section>
    </div>
  );
}

function FoodAlert({ icon: Icon, title, description, tone }: { icon: LucideIcon; title: string; description: string; tone: "cyan" | "orange" | "amber" }) {
  const styles = {
    cyan: "bg-cyan-300/10 text-cyan-200",
    orange: "bg-orange-300/10 text-orange-200",
    amber: "bg-amber-300/10 text-amber-200",
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 p-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${styles[tone]}`}><Icon aria-hidden="true" size={18} /></span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="text-xs leading-5 text-muted break-words">{description}</p>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/75 p-4">
      <span className="flex size-10 items-center justify-center rounded-xl bg-white/[0.06] text-brand-700"><Icon aria-hidden="true" size={18} /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
        <p className="mt-1 truncate text-sm font-bold text-ink">{value}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}
