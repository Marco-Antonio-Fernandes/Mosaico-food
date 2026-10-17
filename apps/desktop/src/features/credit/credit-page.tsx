import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, Check, CreditCard, RefreshCw, Search, Wallet, X } from "lucide-react";
import { getCreditLedger, receiveCreditPayment, type CreditCustomerRecord, type ReceivedPaymentMethod } from "@/lib/food-api";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatShortDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));

function parseAmount(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function CreditPage() {
  const [customers, setCustomers] = useState<CreditCustomerRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados do crediário.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const accounts = useMemo(() => customers.filter(customer => customer.creditAccount), [customers]);
  const openAccounts = useMemo(() => accounts
    .filter(customer => (customer.creditAccount?.balanceCents ?? 0) > 0)
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" })), [accounts]);
  const delinquentAccounts = useMemo(() => openAccounts
    .filter(customer => customer.creditStatus === "late" && (customer.lateDays ?? 0) > 0)
    .sort((left, right) => (right.lateDays ?? 0) - (left.lateDays ?? 0) || left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" })), [openAccounts]);
  const totalOpen = openAccounts.reduce((sum, customer) => sum + (customer.creditAccount?.balanceCents ?? 0), 0);
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const matchesSearch = (customer: CreditCustomerRecord) => !normalizedSearch || `${customer.name} ${customer.phone ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
  const filteredAccounts = openAccounts.filter(matchesSearch);
  const filteredDelinquentAccounts = delinquentAccounts.filter(matchesSearch);
  const selectedCustomer = openAccounts.find(customer => customer.id === selected) ?? null;
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
      setReceiptOpen(false);
      setNotice(`Recebimento de ${money(amountCents)} registrado para ${selectedCustomer.name}.`);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar o recebimento.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="credit-page">
    <section className="credit-summary credit-summary-compact" aria-label="Resumo do crediário">
      <article className="credit-summary-card credit-summary-main"><span className="credit-summary-icon"><Wallet size={19} aria-hidden="true" /></span><div><p>Total em aberto</p><strong>{loading ? "—" : money(totalOpen)}</strong><small>Saldo somado das contas de clientes</small></div></article>
      <article className="credit-summary-card"><span className="credit-summary-icon"><CreditCard size={19} aria-hidden="true" /></span><div><p>Contas com saldo</p><strong>{loading ? "—" : openAccounts.length}</strong><small>{openAccounts.length === 1 ? "cliente com valor a receber" : "clientes com valor a receber"}</small></div></article>
      <button className="credit-refresh" type="button" onClick={() => void load(true)} disabled={loading || refreshing} aria-label="Atualizar crediário"><RefreshCw size={16} className={refreshing ? "credit-spin" : ""} /><span className="sr-only">{refreshing ? "Atualizando" : "Atualizar"}</span></button>
    </section>

    {error && <div className="credit-alert credit-alert-error" role="alert"><strong>Não foi possível concluir</strong><span>{error}</span></div>}
    {notice && <div className="credit-alert credit-alert-success" role="status"><Check size={17} aria-hidden="true" /><span>{notice}</span></div>}

    <div className="credit-toolbar">
      <label className="credit-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar cliente</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone" /></label>
      <span className="credit-filter-hint">Lista principal em ordem alfabética · inadimplência acima de 30 dias</span>
    </div>

    <div className="credit-workspace">
      <section className="credit-card credit-account-panel" aria-labelledby="credit-accounts-title">
        <header className="credit-card-header"><div><h2 id="credit-accounts-title">Saldos em aberto</h2><p>Todos os clientes que ainda têm valor a receber, em ordem alfabética.</p></div><div className="credit-card-header-actions"><span className="credit-count">{loading ? "…" : openAccounts.length}</span><button className="credit-receipt-button" type="button" disabled={!selectedCustomer || saving} onClick={() => setReceiptOpen(true)}><ArrowDownLeft size={16} />Registrar recebimento</button></div></header>
        <div className="credit-account-list" aria-live="polite">
          {loading ? <div className="credit-state"><span className="credit-loader" />Carregando contas…</div>
            : filteredAccounts.length ? filteredAccounts.map(customer => {
              const account = customer.creditAccount!;
              const active = selected === customer.id;
              return <button type="button" key={customer.id} className={`credit-account-row${active ? " is-selected" : ""}`} aria-pressed={active} disabled={saving} onClick={() => chooseCustomer(customer)}>
                <span className="credit-avatar" aria-hidden="true">{customer.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                <span className="credit-account-name"><strong>{customer.name}</strong><small>{customer.phone || "Telefone não informado"}</small></span>
                <span className="credit-account-balance"><strong>{money(account.balanceCents)}</strong><small>Saldo pendente</small></span>
              </button>;
            }) : <div className="credit-state"><span className="credit-state-icon"><Check size={20} /></span><strong>{search ? "Nenhum cliente encontrado" : "Tudo em dia"}</strong><span>{search ? "Tente outro nome ou telefone." : "Não há saldos pendentes para receber."}</span></div>}
        </div>
      </section>

      <section className="credit-card credit-delinquent-panel" aria-labelledby="credit-delinquent-title">
        <header className="credit-card-header"><div><h2 id="credit-delinquent-title">Inadimplência</h2><p>Clientes com saldo pendente há mais de um mês.</p></div><span className="credit-count credit-count-danger">{loading ? "…" : delinquentAccounts.length}</span></header>
        <div className="credit-delinquent-list" aria-live="polite">
          {loading ? <div className="credit-state"><span className="credit-loader" />Analisando atrasos…</div>
            : filteredDelinquentAccounts.length ? filteredDelinquentAccounts.map(customer => <button type="button" key={customer.id} className={`credit-delinquent-row${selected === customer.id ? " is-selected" : ""}`} aria-pressed={selected === customer.id} disabled={saving} onClick={() => chooseCustomer(customer)}>
              <span className="credit-avatar credit-avatar-danger" aria-hidden="true">{customer.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
              <span className="credit-account-name"><strong>{customer.name}</strong><small>{customer.phone || "Telefone não informado"}</small><small className="credit-late-label">{customer.lateDays ?? 0} dias em atraso{customer.lastPaymentAt ? ` · último pagamento ${formatShortDate(customer.lastPaymentAt)}` : " · sem pagamento registrado"}</small></span>
              <span className="credit-account-balance"><strong>{money(customer.creditAccount?.balanceCents ?? 0)}</strong><small>Em aberto</small></span>
            </button>) : <div className="credit-state"><span className="credit-state-icon credit-state-icon-good"><Check size={20} /></span><strong>{search ? "Nenhum inadimplente encontrado" : "Nenhuma inadimplência"}</strong><span>{search ? "Tente outro nome ou telefone." : "Não há clientes com mais de 30 dias de atraso."}</span></div>}
        </div>
      </section>
    </div>

    {receiptOpen && selectedCustomer && <div className="credit-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setReceiptOpen(false); }}><section className="credit-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="credit-receipt-title">
      <header className="credit-card-header"><div><h2 id="credit-receipt-title">Registrar recebimento</h2><p>Registre um pagamento parcial ou quite o saldo.</p></div><button type="button" className="credit-modal-close" aria-label="Fechar registro de recebimento" onClick={() => setReceiptOpen(false)} disabled={saving}><X size={18} /></button></header>
      <div className="credit-receipt-modal-body">
        <div className="credit-selected-customer"><span className="credit-avatar">{selectedCustomer.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}</span><div><small>Cliente selecionado</small><strong>{selectedCustomer.name}</strong></div><div className="credit-selected-balance"><small>Saldo atual</small><strong>{money(selectedBalance)}</strong></div></div>
        <label className="credit-field">Valor recebido <span className="credit-currency"><span>R$</span><input autoFocus disabled={saving} inputMode="decimal" autoComplete="off" value={amount} onChange={event => { setAmount(event.target.value); setOperationId(crypto.randomUUID()); setError(""); setNotice(""); }} placeholder="0,00" aria-describedby="credit-amount-hint" /></span></label>
        <div className="credit-amount-hints" id="credit-amount-hint"><span>Saldo: {money(selectedBalance)}</span><button type="button" disabled={saving} onClick={() => { setAmount((selectedBalance / 100).toFixed(2).replace(".", ",")); setOperationId(crypto.randomUUID()); }}>Quitar saldo</button></div>
        <label className="credit-field">Forma de recebimento<select value={paymentMethod} disabled={saving} onChange={event => { setPaymentMethod(event.target.value as ReceivedPaymentMethod | ""); setOperationId(crypto.randomUUID()); setError(""); }}><option value="">Selecione a forma</option><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option></select></label>
        {amountCents > 0 && <p className={`credit-after-payment${overBalance ? " is-invalid" : ""}`}>Saldo após recebimento <strong>{money(Math.max(0, selectedBalance - amountCents))}</strong></p>}
        <button className="credit-submit" type="button" disabled={saving || loading || !paymentMethod || amountCents <= 0 || overBalance} onClick={() => void submit()}>{saving ? <><span className="credit-button-spinner" />Registrando…</> : <><ArrowDownLeft size={17} />Registrar recebimento</>}</button>
        <p className="credit-secure-note">O lançamento atualiza o saldo e fica registrado no histórico da conta.</p>
      </div>
    </section></div>}
  </div>;
}
