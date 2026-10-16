import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, Check, CreditCard, History, RefreshCw, Search, Wallet } from "lucide-react";
import { getCreditLedger, receiveCreditPayment, type CreditCustomerRecord, type CreditEntryRecord, type ReceivedPaymentMethod } from "@/lib/food-api";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function parseAmount(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function CreditPage() {
  const [customers, setCustomers] = useState<CreditCustomerRecord[]>([]);
  const [entries, setEntries] = useState<CreditEntryRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ReceivedPaymentMethod | "">("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const data = await getCreditLedger();
      setCustomers(data.customers);
      setEntries(data.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados do crediário.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const accounts = useMemo(() => customers.filter(customer => customer.creditAccount), [customers]);
  const openAccounts = accounts.filter(customer => (customer.creditAccount?.balanceCents ?? 0) > 0);
  const totalOpen = openAccounts.reduce((sum, customer) => sum + (customer.creditAccount?.balanceCents ?? 0), 0);
  const filteredAccounts = openAccounts.filter(customer => `${customer.name} ${customer.phone ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const selectedCustomer = accounts.find(customer => customer.id === selected) ?? null;
  const selectedBalance = selectedCustomer?.creditAccount?.balanceCents ?? 0;
  const amountCents = parseAmount(amount);
  const overBalance = amountCents > selectedBalance;

  const chooseCustomer = (customer: CreditCustomerRecord) => {
    setSelected(customer.id);
    setAmount("");
    setPaymentMethod(""); setOperationId(crypto.randomUUID());
    setError("");
    setNotice("");
  };

  const submit = async () => {
    if (!selectedCustomer) { setError("Selecione uma conta com saldo em aberto."); return; }
    if (!paymentMethod) { setError("Informe como o pagamento foi recebido."); return; }
    if (amountCents <= 0) { setError("Informe um valor de recebimento maior que zero."); return; }
    if (amountCents > selectedBalance) { setError("O recebimento não pode ser maior que o saldo em aberto."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await receiveCreditPayment(selectedCustomer.id, amountCents, paymentMethod, operationId);
      setAmount("");
      setOperationId(crypto.randomUUID());
      setNotice(`Recebimento de ${money(amountCents)} registrado para ${selectedCustomer.name}.`);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar o recebimento.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="credit-page">
    <section className="credit-summary" aria-label="Resumo do crediário">
      <article className="credit-summary-card credit-summary-main"><span className="credit-summary-icon"><Wallet size={19} aria-hidden="true" /></span><div><p>Total em aberto</p><strong>{loading ? "—" : money(totalOpen)}</strong><small>Saldo somado das contas de clientes</small></div></article>
      <article className="credit-summary-card"><span className="credit-summary-icon"><CreditCard size={19} aria-hidden="true" /></span><div><p>Contas com saldo</p><strong>{loading ? "—" : openAccounts.length}</strong><small>{openAccounts.length === 1 ? "cliente com valor a receber" : "clientes com valor a receber"}</small></div></article>
      <button className="credit-refresh" type="button" onClick={() => void load(true)} disabled={loading || refreshing} aria-label="Atualizar crediário"><RefreshCw size={16} className={refreshing ? "credit-spin" : ""} />{refreshing ? "Atualizando" : "Atualizar"}</button>
    </section>

    {error && <div className="credit-alert credit-alert-error" role="alert"><strong>Não foi possível concluir</strong><span>{error}</span></div>}
    {notice && <div className="credit-alert credit-alert-success" role="status"><Check size={17} aria-hidden="true" /><span>{notice}</span></div>}

    <div className="credit-workspace">
      <section className="credit-card credit-account-panel" aria-labelledby="credit-accounts-title">
        <header className="credit-card-header"><div><h2 id="credit-accounts-title">Saldos em aberto</h2><p>Selecione um cliente para registrar um recebimento.</p></div><span className="credit-count">{loading ? "…" : openAccounts.length}</span></header>
        <label className="credit-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar cliente</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone" /></label>
        <div className="credit-account-list" aria-live="polite">
          {loading ? <div className="credit-state"><span className="credit-loader" />Carregando contas…</div>
            : filteredAccounts.length ? filteredAccounts.map(customer => {
              const account = customer.creditAccount!;
              const active = selected === customer.id;
              const available = account.creditLimitCents === null ? null : Math.max(account.creditLimitCents - account.balanceCents, 0);
              return <button type="button" key={customer.id} className={`credit-account-row${active ? " is-selected" : ""}`} aria-pressed={active} disabled={saving} onClick={() => chooseCustomer(customer)}>
                <span className="credit-avatar" aria-hidden="true">{customer.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                <span className="credit-account-name"><strong>{customer.name}</strong><small>{customer.phone || "Telefone não informado"}</small></span>
                <span className="credit-account-balance"><strong>{money(account.balanceCents)}</strong><small>{available === null ? "Sem limite" : `${money(available)} disponível`}</small></span>
              </button>;
            }) : <div className="credit-state"><span className="credit-state-icon"><Check size={20} /></span><strong>{search ? "Nenhum cliente encontrado" : "Tudo em dia"}</strong><span>{search ? "Tente outro nome ou telefone." : "Não há saldos pendentes para receber."}</span></div>}
        </div>
      </section>

      <section className="credit-card credit-receipt-panel" aria-labelledby="credit-receipt-title">
        <header className="credit-card-header"><div><h2 id="credit-receipt-title">Registrar recebimento</h2><p>Registre um pagamento parcial ou quite o saldo.</p></div><span className="credit-receipt-icon"><ArrowDownLeft size={19} aria-hidden="true" /></span></header>
        {selectedCustomer ? <>
          <div className="credit-selected-customer"><span className="credit-avatar">{selectedCustomer.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}</span><div><small>Cliente selecionado</small><strong>{selectedCustomer.name}</strong></div><div className="credit-selected-balance"><small>Saldo atual</small><strong>{money(selectedBalance)}</strong></div></div>
          <label className="credit-field">Valor recebido <span className="credit-currency"><span>R$</span><input disabled={saving} inputMode="decimal" autoComplete="off" value={amount} onChange={event => { setAmount(event.target.value); setOperationId(crypto.randomUUID()); setError(""); setNotice(""); }} placeholder="0,00" aria-describedby="credit-amount-hint" /></span></label>
          <div className="credit-amount-hints" id="credit-amount-hint"><span>Saldo: {money(selectedBalance)}</span><button type="button" disabled={saving} onClick={() => { setAmount((selectedBalance / 100).toFixed(2).replace(".", ",")); setOperationId(crypto.randomUUID()); }}>Quitar saldo</button></div>
          <label className="credit-field">Forma de recebimento<select value={paymentMethod} disabled={saving} onChange={event => { setPaymentMethod(event.target.value as ReceivedPaymentMethod | ""); setOperationId(crypto.randomUUID()); setError(""); }}><option value="">Selecione a forma</option><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option></select></label>
          {amountCents > 0 && <p className={`credit-after-payment${overBalance ? " is-invalid" : ""}`}>Saldo após recebimento <strong>{money(Math.max(0, selectedBalance - amountCents))}</strong></p>}
          <button className="credit-submit" type="button" disabled={saving || loading || !paymentMethod || amountCents <= 0 || overBalance} onClick={() => void submit()}>{saving ? <><span className="credit-button-spinner" />Registrando…</> : <><ArrowDownLeft size={17} />Registrar recebimento</>}</button>
          <p className="credit-secure-note">O lançamento atualiza o saldo e fica registrado no histórico da conta.</p>
        </> : <div className="credit-receipt-empty"><span className="credit-empty-icon"><ArrowDownLeft size={21} /></span><strong>Escolha uma conta</strong><span>Selecione um cliente na lista para informar o valor recebido.</span></div>}
      </section>
    </div>

    <section className="credit-card credit-history" aria-labelledby="credit-history-title">
      <header className="credit-card-header"><div className="credit-history-title"><span className="credit-history-icon"><History size={18} aria-hidden="true" /></span><div><h2 id="credit-history-title">Movimentações recentes</h2><p>Vendas a prazo e recebimentos registrados.</p></div></div><span className="credit-history-total">{loading ? "…" : `${entries.length} lançamentos`}</span></header>
      <div className="credit-table-wrap"><table className="credit-table"><thead><tr><th>Cliente</th><th>Movimentação</th><th>Data</th><th className="credit-amount-col">Valor</th></tr></thead><tbody>
        {entries.slice(0, 12).map(entry => {
          const isPayment = entry.type === "payment";
          return <tr key={entry.id}><td><strong>{entry.creditAccount?.customer?.name ?? "Cliente"}</strong></td><td><span className={`credit-entry-type${isPayment ? " is-payment" : ""}`}>{isPayment ? <ArrowDownLeft size={14} /> : <CreditCard size={14} />}{isPayment ? "Recebimento" : entry.type === "charge" ? "Compra a crédito" : "Estorno"}</span></td><td>{formatDate(entry.occurredAt)}</td><td className={`credit-amount-col${isPayment ? " is-payment" : ""}`}>{isPayment ? "−" : "+"}{money(entry.amountCents)}</td></tr>;
        })}
      </tbody></table></div>
      {!loading && !entries.length && <div className="credit-history-empty"><History size={20} /><span>Nenhuma movimentação registrada ainda.</span></div>}
    </section>
  </div>;
}
