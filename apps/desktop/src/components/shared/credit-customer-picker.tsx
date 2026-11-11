import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Search, UserRound, X } from "lucide-react";
import type { CreditCustomerRecord } from "@/lib/food-api";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  customers: CreditCustomerRecord[];
  value: string;
  onChange: (customerId: string) => void;
  disabled?: boolean;
  loading?: boolean;
};

export function CreditCustomerPicker({ customers, value, onChange, disabled = false, loading = false }: Props) {
  const selected = customers.find(customer => customer.id === value) ?? null;
  const [search, setSearch] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSearch(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  const results = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return customers.slice(0, 8);
    return customers.filter(customer => `${customer.name} ${customer.phone ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 8);
  }, [customers, search]);

  const choose = (customer: CreditCustomerRecord) => {
    onChange(customer.id);
    setSearch(customer.name);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setSearch("");
    setOpen(true);
  };

  const balance = selected?.creditAccount?.balanceCents ?? 0;
  const status = selected?.creditStatus ?? "on_time";
  const late = status === "late";
  const warning = status === "warning";
  const owes = balance > 0;
  const statusLabel = late ? "Atrasado" : warning ? "Atraso recente" : owes ? "Com saldo em aberto" : "Sem saldo em aberto";
  const hint = late
    ? `Atenção: este cliente deve ${money(balance)} e está ${selected?.lateDays ?? 0} dias em atraso. Confirme antes de vender.`
    : warning
      ? `Atenção: este cliente deve ${money(balance)} e já está ${selected?.lateDays ?? 0} dia(s) em atraso. A nova venda aumentará a dívida.`
      : owes
        ? `Atenção: este cliente já deve ${money(balance)}. A nova venda vai aumentar a dívida.`
        : "Cliente selecionado para lançar esta venda no crediário.";

  return <div className="credit-customer-picker">
    <label>Cliente do crediário
      <span className="credit-customer-search"><Search size={15} aria-hidden="true" /><input value={search} disabled={disabled || loading} onFocus={() => setOpen(true)} onChange={event => { setSearch(event.target.value); if (value) onChange(""); setOpen(true); }} placeholder={loading ? "Carregando clientes…" : "Digite o nome ou telefone…"} /></span>
    </label>
    {open && !selected && <div className="credit-customer-results" role="listbox">
      {results.length ? results.map(customer => <button type="button" role="option" key={customer.id} className={`is-${customer.creditStatus ?? "on_time"}`} onClick={() => choose(customer)} disabled={disabled}>
        <span className="credit-customer-result-icon"><UserRound size={14} /></span><span><strong>{customer.name}</strong><small>{customer.phone || "Telefone não informado"}</small></span><b>{money(customer.creditAccount?.balanceCents ?? 0)}</b>
      </button>) : <small className="credit-customer-empty">Nenhum cliente com conta de crediário encontrado.</small>}
    </div>}
    {selected && <div className={`credit-customer-selected${late ? " is-late" : warning ? " is-warning" : ""}`}>
      <div><span className="credit-customer-result-icon"><UserRound size={14} /></span><span><strong>{selected.name}</strong><small>{selected.phone || "Telefone não informado"}</small></span></div>
      <div className="credit-customer-status"><span className="credit-status-dot" /><strong>{statusLabel}</strong><small>Saldo atual: {money(balance)}{selected.creditAccount?.creditLimitCents !== null && selected.creditAccount?.creditLimitCents !== undefined ? ` · Limite: ${money(selected.creditAccount.creditLimitCents)}` : ""}</small></div>
      <button type="button" className="credit-customer-clear" onClick={clear} disabled={disabled} aria-label="Trocar cliente"><X size={15} /></button>
    </div>}
    {selected && <p className={`credit-customer-hint${late ? " is-late" : warning ? " is-warning" : owes ? " is-debt" : ""}`}>{owes ? <AlertTriangle size={14} /> : <Check size={14} />}{hint}</p>}
  </div>;
}
