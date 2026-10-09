import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  CircleDashed,
  CircleSlash,
  LoaderCircle,
} from "lucide-react";

interface StateCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function EmptyState({ title, description, icon: Icon }: StateCardProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon aria-hidden="true" size={27} strokeWidth={1.8} />
      </div>
      <h2 className="mt-6 text-xl font-bold tracking-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function LoadingState({ title, description, icon: Icon = LoaderCircle }: StateCardProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <Icon aria-hidden="true" className="animate-spin text-brand-600" size={27} />
      <h2 className="mt-6 text-xl font-bold tracking-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function ErrorState({ title, description, icon: Icon = CircleAlert }: StateCardProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <Icon aria-hidden="true" className="text-red-700" size={27} />
      <h2 className="mt-6 text-xl font-bold tracking-tight text-red-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-red-800">{description}</p>
    </div>
  );
}

export function PermissionDeniedState({
  title,
  description,
  icon: Icon = CircleSlash,
}: StateCardProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-white/[0.04] px-6 py-12 text-center">
      <Icon aria-hidden="true" className="text-slate-600" size={27} />
      <h2 className="mt-6 text-xl font-bold tracking-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function StateIndicator({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">
      <CircleDashed aria-hidden="true" size={16} />
      {label}
    </span>
  );
}
