import { CircleAlert, CircleCheck, CircleOff, type LucideIcon } from "lucide-react";

export type DesktopConnectionState = "unknown" | "online" | "offline";

export interface DesktopConnectionStatus {
  state: DesktopConnectionState;
  label: string;
}

interface ConnectionStatusProps {
  status: DesktopConnectionStatus;
}

const stateStyles: Record<
  DesktopConnectionState,
  {
    className: string;
    Icon: LucideIcon;
  }
> = {
  unknown: {
    className: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    Icon: CircleAlert,
  },
  online: {
    className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
    Icon: CircleCheck,
  },
  offline: {
    className: "border-white/10 bg-white/[0.06] text-slate-300",
    Icon: CircleOff,
  },
};

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const stateStyle = stateStyles[status.state];
  const Icon = stateStyle.Icon;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${stateStyle.className}`}
      role="status"
      aria-label={`Estado da conexão: ${status.label}`}
    >
      <Icon aria-hidden="true" className="shrink-0" size={14} strokeWidth={2.2} />
      <span>{status.label}</span>
    </div>
  );
}
