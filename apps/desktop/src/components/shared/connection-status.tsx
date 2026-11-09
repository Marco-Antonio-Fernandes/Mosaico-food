import { CircleAlert, CircleCheck, CircleOff, type LucideIcon } from "lucide-react";

export type DesktopConnectionState = "unknown" | "online" | "offline";

export interface DesktopConnectionStatus {
  state: DesktopConnectionState;
  label: string;
}

interface ConnectionStatusProps {
  status: DesktopConnectionStatus;
  compact?: boolean;
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
    className: "border-red-300/30 bg-red-300/10 text-red-100",
    Icon: CircleOff,
  },
};

export function ConnectionStatus({ status, compact = false }: ConnectionStatusProps) {
  const stateStyle = stateStyles[status.state];
  const Icon = stateStyle.Icon;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border text-xs font-semibold ${compact ? "mosaic-connection-compact size-9 justify-center p-0" : "px-3 py-1.5"} ${stateStyle.className}`}
      role="status"
      aria-label={`Estado da conexão: ${status.label}`}
      title={status.label}
    >
      <Icon aria-hidden="true" className="shrink-0" size={14} strokeWidth={2.2} />
      <span className={compact ? "sr-only" : undefined}>{status.label}</span>
    </div>
  );
}
