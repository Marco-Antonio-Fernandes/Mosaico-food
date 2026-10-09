interface MosaicMarkProps {
  label?: string;
  compact?: boolean;
}

const tiles = [
  "bg-orange-400 rounded-[65%_25%_45%_35%]",
  "bg-amber-300 rounded-[25%_70%_35%_45%]",
  "bg-rose-400 rounded-[35%_35%_70%_20%]",
  "bg-lime-300 rounded-[45%_25%_30%_70%]",
  "bg-orange-500 rounded-[35%]",
  "bg-cyan-300 rounded-[70%_30%_30%_55%]",
  "bg-cyan-400 rounded-[25%_45%_70%_30%]",
  "bg-emerald-300 rounded-[55%_30%_35%_65%]",
  "bg-yellow-200 rounded-[30%_65%_25%_45%]",
];

export function MosaicMark({
  label = "Mosaico Food",
  compact = false,
}: MosaicMarkProps) {
  return (
    <span
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-2xl bg-white/[0.06] p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.24)] ring-1 ring-white/10 ${compact ? "size-10" : "size-12"}`}
      role="img"
    >
      <span className="grid size-full grid-cols-3 gap-0.5 overflow-hidden rounded-xl">
        {tiles.map((tile, index) => (
          <span
            aria-hidden="true"
            className={`${tile} ${index === 4 ? "scale-90 rounded-md" : ""}`}
            key={`${tile}-${index}`}
          />
        ))}
      </span>
    </span>
  );
}
