import type { LucideIcon } from "lucide-react";
import { Activity, ArrowRight, Clock3, Layers3 } from "lucide-react";

import { PageHeader } from "./page-header";
import { EmptyState, StateIndicator } from "./ui-states";

interface PlaceholderDefinition {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface PlaceholderPageProps {
  definition: PlaceholderDefinition;
}

export function PlaceholderPage({ definition }: PlaceholderPageProps) {
  const Icon = definition.icon;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={definition.eyebrow}
        title={definition.title}
        description={definition.description}
        aside={<StateIndicator label="Base em construção" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Activity} label="Movimentação hoje" value="0" detail="Aguardando dados reais" />
        <MetricCard icon={Clock3} label="Pendências" value="0" detail="Nenhuma pendência local" />
        <MetricCard icon={Layers3} label="Módulo" value="Base pronta" detail="Próxima etapa: conectar" />
      </div>

      <section className="relative overflow-hidden rounded-panel border border-line bg-gradient-to-br from-surface via-surface to-orange-400/[0.06] shadow-panel">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-orange-400/[0.08] blur-3xl" />
        <div className="grid min-h-[26rem] items-center gap-8 p-7 sm:p-12 lg:grid-cols-[1fr_0.8fr] lg:p-16">
          <div>
            <EmptyState
              icon={Icon}
              title={`${definition.label} está preparada para receber os dados reais`}
              description="Esta tela faz parte do layout base. A regra de negócio, a API e os estados comerciais serão implementados na task do módulo responsável."
            />
            <div className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-orange-200">
              Próxima etapa: conectar o módulo
              <ArrowRight aria-hidden="true" size={16} />
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-line bg-canvas p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
              Estado atual
            </p>
            <div className="mt-5 space-y-3">
              <StateRow label="Layout" value="Pronto" tone="success" />
              <StateRow label="Dados comerciais" value="Aguardando API" tone="neutral" />
              <StateRow label="Integração" value="Não configurada" tone="warning" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface StateRowProps {
  label: string;
  value: string;
  tone: "success" | "neutral" | "warning";
}

const stateToneClasses: Record<StateRowProps["tone"], string> = {
  success: "bg-emerald-400/10 text-emerald-200",
  neutral: "bg-white/[0.06] text-slate-300",
  warning: "bg-amber-400/10 text-amber-200",
};

function StateRow({ label, value, tone }: StateRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface px-4 py-3">
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${stateToneClasses[tone]}`}>
        {value}
      </span>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-5 shadow-soft">
      <div className="flex items-center justify-between gap-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <Icon aria-hidden="true" size={19} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Food</span>
      </div>
      <p className="mt-5 text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{label}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
