import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { FOOD_NCM_CATALOG } from "@/data/food-ncm-catalog";
import type { NcmOption } from "@/data/ncm-catalog";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR");

const labelFor = (item: NcmOption) => `${item.code} — ${item.description}`;

export function NcmPicker({ value, onChange }: Props) {
  const selected = FOOD_NCM_CATALOG.find((item) => item.code === value) ?? null;
  const [search, setSearch] = useState(selected ? labelFor(selected) : value);
  const [open, setOpen] = useState(false);
  const skipSync = useRef(false);

  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    setSearch(selected ? labelFor(selected) : value);
  }, [selected?.code, value]);

  const results = useMemo(() => {
    const query = normalize(search.trim());
    if (!query || query === normalize(selected ? labelFor(selected) : "")) return FOOD_NCM_CATALOG;
    const digits = search.replace(/\D/g, "");
    return FOOD_NCM_CATALOG.filter((item) => normalize(labelFor(item)).includes(query) || item.code.includes(digits));
  }, [search, selected]);

  const choose = (item: NcmOption) => {
    skipSync.current = true;
    onChange(item.code);
    setSearch(labelFor(item));
    setOpen(false);
  };

  return <div className="ncm-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span className="ncm-picker-input">
      <Search size={15} aria-hidden="true" />
      <input
        inputMode="search"
        autoComplete="off"
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setSearch(next);
          const digits = next.replace(/\D/g, "").slice(0, 8);
          skipSync.current = true;
          onChange(FOOD_NCM_CATALOG.some((item) => item.code === digits) && next.replace(/\D/g, "").length === 8 ? digits : "");
          setOpen(true);
        }}
        placeholder="Digite código ou descrição"
        aria-label="Buscar NCM por código ou descrição"
      />
    </span>
    {open && <div className="ncm-picker-results" role="listbox" aria-label="NCMs encontrados">
      {results.length ? results.map((item) => <button type="button" role="option" key={`${item.code}-${item.description}`} aria-selected={item.code === value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
        <span><strong>{item.code}</strong><small>{item.description}</small></span>
        {item.code === value && <Check size={15} aria-hidden="true" />}
      </button>) : <small className="ncm-picker-empty">Nenhuma classificação encontrada na lista do Mosaico Food.</small>}
    </div>}
    <small className="ncm-picker-help">{selected ? `Selecionado: ${selected.code} · ${selected.description}` : "Escolha uma classificação da lista de alimentos."}</small>
  </div>;
}
