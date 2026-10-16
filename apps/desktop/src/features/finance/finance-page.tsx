import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Landmark, LoaderCircle, Plus, RefreshCw, Search, Wallet } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/shared/ui-states";
import { Panel, Tabs } from "@/components/shared/prototype-kit";
import { CashPage } from "@/features/cash/cash-page";
import { maskCashAmount, money, parseCashAmount, paymentLabels } from "@/features/cash/cash-api";
import { loadFinance, loadFinanceFlow, writeFinance, type FinanceFlow, type FinanceSale } from "./finance-api";

type Data = Awaited<ReturnType<typeof loadFinance>>;
const day = (value: string) => value.split("-").reverse().join("/");
const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
function Amount({ label, value, change, required = true }: { label: string; value: string; change: (value: string) => void; required?: boolean }) {
  return <label>{label} (R$)<input inputMode="numeric" required={required} maxLength={24} value={value} onChange={event => change(maskCashAmount(event.target.value))} placeholder="0,00" /></label>;
}
function amount(value: string, zero = false) {
  const cents = parseCashAmount(value);
  if (cents === null || (!zero && cents === 0)) throw new Error("Informe um valor válido de até R$ 1.000.000,00.");
  return cents;
}
function message(error: unknown) { return error instanceof TypeError ? "Não foi possível acessar o backend. Tente novamente." : error instanceof Error ? error.message : "Não foi possível concluir a operação."; }
const sourceNames: Record<string, string> = { balcao: "Balcão", whatsapp: "WhatsApp", assistant: "Assistente" };

function Disclosure({ title, description, children, danger = false }: { title: string; description?: string; children: ReactNode; danger?: boolean }) {
  return <details className={`finance-disclosure${danger ? " is-danger" : ""}`}><summary><span><strong>{title}</strong>{description && <small>{description}</small>}</span><ChevronDown aria-hidden="true" size={18} /></summary><div className="finance-disclosure-body">{children}</div></details>;
}
function saleStatus(sale: FinanceSale) {
  if (sale.cancelled) return "Cancelada";
  if (sale.credited) return "Crediário";
  if (sale.legacyPaid) return "A conferir";
  return sale.pendingCents === 0 ? "Recebida" : sale.receivedCents > sale.refundedCents ? "Parcial" : "Pendente";
}
export function FinancePage() {
  const [tab, setTab] = useState("Caixa");
  return <div className="finance-shell"><nav className="finance-navigation" aria-label="Áreas do financeiro"><Tabs items={["Caixa", "Pagamentos e estornos", "Contas e bancos", "Fluxo financeiro"]} value={tab} onChange={setTab} /></nav>{tab === "Caixa" ? <CashPage /> : <FinanceOperations section={tab} />}</div>;
}
function FinanceOperations({ section }: { section: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const lock = useRef(false);
  const intents = useRef(new Map<string, string>());
  const alive = useRef(true);
  const [refreshing, setRefreshing] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const flowRequest = useRef(0);
  const detailRef = useRef<HTMLDivElement>(null);
  const settlementRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [accountsTab, setAccountsTab] = useState("Contas a pagar e receber");
  const [saleSearch, setSaleSearch] = useState("");
  const [saleFilter, setSaleFilter] = useState("Todas");
  const [titleSearch, setTitleSearch] = useState("");
  const [titleFilter, setTitleFilter] = useState("Pendentes");
  const [cardFilter, setCardFilter] = useState("Pendentes");
  const refresh = useCallback(async () => { const next = await loadFinance(); if (alive.current) setData(next); }, []);
  useEffect(() => { alive.current = true; void refresh().catch(error => setError(message(error))).finally(() => setLoading(false)); return () => { alive.current = false; }; }, [refresh]);
  async function submit(path: string, payload: Record<string, unknown>, success: string, reset?: () => void) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    const key = JSON.stringify({ path, payload });
    const operationId = intents.current.get(key) ?? crypto.randomUUID();
    intents.current.set(key, operationId);
    try {
      await writeFinance(path, { ...payload, operationId });
      intents.current.delete(key);
      reset?.(); setFlow(null); setNotice(success);
      try { await refresh(); } catch { setError("A operação foi registrada, mas os valores não puderam ser atualizados. Use Atualizar para conferir."); }
    } catch (error) { setError(message(error)); } finally { lock.current = false; setBusy(false); }
  }
  function attempt(work: () => void) { try { work(); } catch (error) { setError(message(error)); } }
  const [saleId, setSaleId] = useState("");
  const sale = data?.sales.find(item => `${item.type}:${item.id}` === saleId);
  const [payments, setPayments] = useState([{ paymentMethod: "cash", amount: "" }]);
  const [receiptId, setReceiptId] = useState("");
  const [refundValue, setRefundValue] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [creditReceiptId, setCreditReceiptId] = useState("");
  const [creditRefundValue, setCreditRefundValue] = useState("");
  const [creditRefundNote, setCreditRefundNote] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [cancelReview, setCancelReview] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [opening, setOpening] = useState("0,00");
  const [titleKind, setTitleKind] = useState("payable");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [titleAmount, setTitleAmount] = useState("");
  const [dueDate, setDueDate] = useState(localDate());
  const [titleId, setTitleId] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState("cash");
  const [accountId, setAccountId] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [cardId, setCardId] = useState("");
  const [cardDate, setCardDate] = useState(localDate());
  const [fee, setFee] = useState("0,00");
  const [cardAccount, setCardAccount] = useState("");
  const [from, setFrom] = useState(() => `${localDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(localDate());
  const [flow, setFlow] = useState<FinanceFlow | null>(null);
  const [flowBusy, setFlowBusy] = useState(false);
  useEffect(() => {
    setError(""); setNotice(""); setFlow(null); setFlowBusy(false); ++flowRequest.current;
    if (section === "Fluxo financeiro") void queryFlow();
    return () => { ++flowRequest.current; };
  }, [section]);
  useEffect(() => { if (error || notice) feedback.current?.focus(); }, [error, notice]);
  async function queryFlow(event?: FormEvent, range?: { from: string; to: string }) {
    event?.preventDefault(); setError(""); setFlowBusy(true);
    const requestId = ++flowRequest.current;
    try {
      const next = await loadFinanceFlow(range?.from ?? from, range?.to ?? to);
      if (requestId === flowRequest.current && alive.current) setFlow(next);
    } catch (error) {
      if (requestId === flowRequest.current && alive.current) { setError(message(error)); setFlow(null); }
    } finally { if (requestId === flowRequest.current && alive.current) setFlowBusy(false); }
  }
  function choosePeriod(days: number | "month") {
    const today = localDate();
    const start = new Date(`${today}T12:00:00Z`);
    start.setUTCDate(days === "month" ? 1 : start.getUTCDate() - days + 1);
    const nextFrom = start.toISOString().slice(0, 10);
    setFrom(nextFrom); setTo(today); setFlow(null); void queryFlow(undefined, { from: nextFrom, to: today });
  }
  async function refreshView() {
    setRefreshing(true); setError("");
    try { await refresh(); if (section === "Fluxo financeiro") await queryFlow(); }
    catch (error) { setError(message(error)); } finally { setRefreshing(false); }
  }
  const accountOptions = <><option value="">Selecione a conta</option>{data?.accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {money(account.balanceCents)}</option>)}</>;
  const activeTitle = data?.titles.find(title => title.id === titleId);
  const activeCard = data?.cards.find(card => card.id === cardId);
  const onSubmit = (event: FormEvent, work: () => void) => { event.preventDefault(); attempt(work); };
  const filteredSales = data?.sales.filter(item => (saleFilter === "Todas" || (saleFilter === "A receber" ? !item.cancelled && !item.credited && !item.legacyPaid && item.pendingCents > 0 : saleStatus(item) === saleFilter)) && `${item.description} ${item.id} ${sourceNames[item.source] ?? item.source}`.toLocaleLowerCase("pt-BR").includes(saleSearch.trim().toLocaleLowerCase("pt-BR"))) ?? [];
  const filteredTitles = data?.titles.filter(title => (titleFilter === "Todas" || (titleFilter === "Liquidadas" ? title.status === "settled" : titleFilter === "Vencidas" ? title.status !== "settled" && title.dueDate < localDate() : title.status !== "settled")) && `${title.description} ${title.category}`.toLocaleLowerCase("pt-BR").includes(titleSearch.trim().toLocaleLowerCase("pt-BR"))) ?? [];
  const pendingTitles = data?.titles.filter(title => title.status !== "settled") ?? [];
  const filteredCards = data?.cards.filter(card => cardFilter === "Todos" || (cardFilter === "Concluídos" ? card.settled : !card.settled && card.refundableCents > 0)) ?? [];
  const flowTotals = flow?.days.reduce((totals, row) => ({ incoming: totals.incoming + row.incomingCents, outgoing: totals.outgoing + row.outgoingCents, forecastIn: totals.forecastIn + row.forecastIncomingCents, forecastOut: totals.forecastOut + row.forecastOutgoingCents }), { incoming: 0, outgoing: 0, forecastIn: 0, forecastOut: 0 });
  function selectSale(value: string) {
    setSaleId(value); setPayments([{ paymentMethod: "cash", amount: "" }]); setReceiptId(""); setRefundValue(""); setRefundNote(""); setCancelNote(""); setCancelReview(false);
    requestAnimationFrame(() => { detailRef.current?.scrollIntoView({ block: "start" }); detailRef.current?.focus({ preventScroll: true }); });
  }
  function selectTitle(value: string) {
    setTitleId(value);
    const title = data?.titles.find(item => item.id === value);
    setSettleAmount(title ? maskCashAmount(String(title.amountCents - title.settledCents)) : "");
    requestAnimationFrame(() => { settlementRef.current?.scrollIntoView({ block: "start" }); settlementRef.current?.focus({ preventScroll: true }); });
  }
  function selectCard(value: string) {
    setCardId(value); setFee("0,00"); setCardDate(data?.cards.find(card => card.id === value)?.dueDate ?? localDate());
    requestAnimationFrame(() => { cardRef.current?.scrollIntoView({ block: "start" }); cardRef.current?.focus({ preventScroll: true }); });
  }
  return <div className="cash-page finance-page">
    <div className="finance-toolbar"><p>{section === "Pagamentos e estornos" ? "Recebimentos de todas as origens, em um só lugar." : section === "Contas e bancos" ? "Acompanhe vencimentos e confira os valores nas contas." : "Consulte o que entrou, o que saiu e os próximos vencimentos."}</p><button type="button" className="proto-subtle" disabled={busy || loading || refreshing || flowBusy} onClick={() => void refreshView()}><RefreshCw size={15} aria-hidden="true" className={refreshing ? "finance-spinning" : undefined} />{refreshing ? "Atualizando…" : "Atualizar"}</button></div>
    {(error || notice) && <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"} className={`cash-feedback ${error ? "is-error" : "is-success"}`}>{error || notice}</p>}
    {busy && <p role="status" className="finance-saving"><LoaderCircle size={16} aria-hidden="true" className="finance-spinning" />Registrando operação…</p>}
    {loading ? <LoadingState title="Carregando financeiro" description="Consultando vendas, contas e recebimentos." icon={LoaderCircle} /> : !data ? <EmptyState title="Não foi possível carregar o financeiro" description="Confira sua conexão e use Atualizar para tentar novamente." icon={Wallet} /> : <fieldset disabled={busy} className="finance-fieldset" aria-busy={busy}>
      {section === "Pagamentos e estornos" && <>
        <Panel title="Vendas e recebimentos" subtitle="Encontre a venda e abra o detalhe para receber ou conferir o histórico.">
          <div className="finance-filters"><label className="finance-search"><span>Buscar venda</span><span className="finance-search-input"><Search size={17} aria-hidden="true" /><input type="search" value={saleSearch} onChange={event => setSaleSearch(event.target.value)} placeholder="Cliente, produto, origem ou referência" /></span></label><label><span id="finance-sale-filter">Situação</span><select aria-labelledby="finance-sale-filter" value={saleFilter} onChange={event => setSaleFilter(event.target.value)}>{["Todas", "A receber", "Recebida", "Crediário", "Cancelada"].map(value => <option key={value}>{value}</option>)}</select></label></div>
          <div className="proto-table-wrap finance-directory"><table><thead><tr><th>Venda</th><th>Origem</th><th>Situação</th><th className="cash-number">Total</th><th className="cash-number">Pendente</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{filteredSales.map(item => <tr key={`${item.type}:${item.id}`} className={saleId === `${item.type}:${item.id}` ? "is-selected" : undefined}><td><strong>{item.description}</strong><small>#{item.id.slice(0, 8)}</small></td><td>{sourceNames[item.source] ?? item.source}</td><td><span className={`finance-status ${saleStatus(item) === "Recebida" ? "is-settled" : item.cancelled ? "is-muted" : ""}`}>{saleStatus(item)}</span></td><td className="cash-number">{money(item.totalCents)}</td><td className="cash-number">{item.cancelled || item.credited || item.legacyPaid ? "Não se aplica" : money(item.pendingCents)}</td><td><button type="button" className="proto-subtle" aria-pressed={saleId === `${item.type}:${item.id}`} aria-label={`Abrir venda ${item.id.slice(0, 8)}`} onClick={() => selectSale(`${item.type}:${item.id}`)}>Abrir detalhe</button></td></tr>)}</tbody></table></div>
          {!filteredSales.length && <div className="finance-empty"><Wallet size={24} aria-hidden="true" /><strong>{data.sales.length ? "Nenhuma venda encontrada" : "Suas vendas aparecerão aqui"}</strong><p>{data.sales.length ? "Tente outro termo ou altere a situação." : "Registre uma venda no PDV, nos pedidos ou pelo assistente para acompanhar o recebimento."}</p>{(saleSearch || saleFilter !== "Todas") && <button type="button" className="proto-subtle" onClick={() => { setSaleSearch(""); setSaleFilter("Todas"); }}>Limpar filtros</button>}</div>}
          <p className="proto-caption">{filteredSales.length} de {data.sales.length} vendas</p>
        </Panel>
        {sale && <div ref={detailRef} tabIndex={-1} className="finance-sale-detail">
          <div className="finance-detail-heading"><div><span className="proto-caption">Venda #{sale.id.slice(0, 8)} · {sourceNames[sale.source] ?? sale.source}</span><h2>{sale.description}</h2></div><button type="button" className="proto-subtle" onClick={() => setSaleId("")}>Fechar detalhe</button></div>
          <dl className="finance-summary"><div><dt>Total da venda</dt><dd>{money(sale.totalCents)}</dd></div><div><dt>Recebido</dt><dd>{money(sale.receivedCents)}</dd></div><div><dt>Estornado</dt><dd>{money(sale.refundedCents)}</dd></div><div><dt>Saldo pendente</dt><dd>{sale.cancelled ? "Cancelada" : sale.credited ? "No crediário" : sale.legacyPaid ? "A conferir" : money(sale.pendingCents)}</dd></div></dl>
          {sale.credited && <p className="cash-feedback">Receba pela área de Crediário. O pagamento reduz a dívida do cliente.</p>}{sale.legacyPaid && <p className="cash-feedback">Este pagamento é anterior ao controle financeiro. Confira o histórico antes de conciliar.</p>}
          {!sale.cancelled && !sale.credited && !sale.legacyPaid && sale.pendingCents > 0 && <Panel title="Receber pagamento" subtitle="Receba o saldo inteiro ou informe uma parte para complementar depois."><form className="proto-stack" onSubmit={event => onSubmit(event, () => void submit(`sales/${sale.type}/${sale.id}/payments`, { payments: payments.map(row => ({ paymentMethod: row.paymentMethod, amountCents: amount(row.amount) })) }, "Pagamento registrado.", () => setPayments([{ paymentMethod: "cash", amount: "" }])))}>
            {payments.map((row, index) => <div key={index} className="finance-payment-row"><label><span id={`finance-method-${index}`}>Forma {index + 1}</span><select aria-labelledby={`finance-method-${index}`} value={row.paymentMethod} onChange={event => setPayments(payments.map((item, i) => i === index ? { ...item, paymentMethod: event.target.value } : item))}>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Amount label={`Valor ${index + 1}`} value={row.amount} change={value => setPayments(payments.map((item, i) => i === index ? { ...item, amount: value } : item))} />{payments.length > 1 && <button className="proto-subtle" type="button" onClick={() => setPayments(payments.filter((_, i) => i !== index))}>Remover forma {index + 1}</button>}</div>)}
            <div className="finance-payment-hint"><span>Pendente na venda: <strong>{money(sale.pendingCents)}</strong></span>{payments.length === 1 && <button type="button" className="proto-subtle" onClick={() => setPayments([{ ...payments[0], amount: maskCashAmount(String(sale.pendingCents)) }])}>Usar saldo pendente</button>}</div>
            <div className="proto-toolbar"><button type="submit">Registrar pagamento</button><button type="button" className="proto-subtle" disabled={payments.length >= 10} onClick={() => setPayments([...payments, { paymentMethod: "pix", amount: "" }])}><Plus size={16} aria-hidden="true" />Dividir em outra forma</button></div></form></Panel>}
          <Panel title="Histórico da venda"><div className="proto-table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Forma</th><th className="cash-number">Valor</th><th>Observação</th></tr></thead><tbody>{sale.movements.map(row => <tr key={row.id}><td>{new Date(row.occurredAt).toLocaleString("pt-BR")}</td><td>{row.kind === "refund" ? "Estorno" : "Recebimento"}</td><td>{paymentLabels[row.paymentMethod as keyof typeof paymentLabels] ?? row.paymentMethod}</td><td className="cash-number">{money(row.amountCents)}</td><td>{row.note || "—"}</td></tr>)}</tbody></table></div>{!sale.movements.length && <p className="proto-empty">Nenhum recebimento registrado nesta venda.</p>}</Panel>
          {!sale.cancelled && !sale.credited && !sale.legacyPaid && sale.receivedCents > sale.refundedCents && <Disclosure title="Estornar um recebimento" description="Devolva um valor total ou parcial, com justificativa."><p className="proto-caption">A devolução usa a forma original. Após a liquidação, o valor sai da conta bancária vinculada.</p><form className="proto-stack" onSubmit={event => onSubmit(event, () => void submit("refunds", { movementId: receiptId, amountCents: amount(refundValue), note: refundNote }, "Estorno registrado.", () => { setRefundValue(""); setRefundNote(""); }))}><label><span id="finance-refund-receipt">Recebimento original</span><select aria-labelledby="finance-refund-receipt" required value={receiptId} onChange={event => setReceiptId(event.target.value)}><option value="">Selecione o recebimento</option>{sale.movements.filter(row => row.kind === "receipt").map(row => { const refunded = sale.movements.filter(item => item.originalMovementId === row.id && item.kind === "refund").reduce((sum, item) => sum + item.amountCents, 0); return <option key={row.id} value={row.id} disabled={refunded >= row.amountCents}>{paymentLabels[row.paymentMethod as keyof typeof paymentLabels] ?? row.paymentMethod} · Disponível {money(row.amountCents - refunded)} · {row.id.slice(0, 8)}</option>; })}</select></label><Amount label="Valor a devolver" value={refundValue} change={setRefundValue} /><label>Motivo do estorno<textarea required minLength={3} maxLength={500} value={refundNote} onChange={event => setRefundNote(event.target.value)} /></label><button type="submit">Registrar estorno</button></form></Disclosure>}
          {!sale.cancelled && !sale.legacyPaid && <Disclosure title="Cancelar esta venda" description="O histórico será preservado. Confira os recebimentos antes de continuar." danger><p className="proto-caption">Estorne os valores recebidos antes de cancelar. Produtos consumidos não voltam ao estoque automaticamente.</p><form className="proto-stack" onSubmit={event => { event.preventDefault(); if (!cancelReview) setCancelReview(true); else void submit(`sales/${sale.type}/${sale.id}/cancel`, { note: cancelNote }, "Venda cancelada.", () => setCancelReview(false)); }}><label>Justificativa do cancelamento<textarea required minLength={3} maxLength={500} value={cancelNote} onChange={event => { setCancelNote(event.target.value); setCancelReview(false); }} /></label>{cancelReview && <p role="status" className="cash-feedback">Confirme o cancelamento da venda #{sale.id.slice(0, 8)}, de {money(sale.totalCents)}.</p>}<div className="proto-toolbar"><button type="submit" className="finance-danger-button">{cancelReview ? "Confirmar cancelamento" : "Revisar cancelamento"}</button>{cancelReview && <button type="button" className="proto-subtle" onClick={() => setCancelReview(false)}>Voltar</button>}</div></form></Disclosure>}
        </div>}
        <Disclosure title="Estornar pagamento do crediário" description="A devolução restaura a dívida do cliente.">{data.creditReceipts.some(row => row.availableCents > 0) ? <form className="proto-stack" onSubmit={event => onSubmit(event, () => void submit("refunds", { movementId: creditReceiptId, amountCents: amount(creditRefundValue), note: creditRefundNote }, "Recebimento de crediário estornado.", () => { setCreditRefundValue(""); setCreditRefundNote(""); }))}><label><span id="finance-credit-receipt">Pagamento do crediário</span><select aria-labelledby="finance-credit-receipt" required value={creditReceiptId} onChange={event => setCreditReceiptId(event.target.value)}><option value="">Selecione o recebimento</option>{data.creditReceipts.filter(row => row.availableCents > 0).map(row => <option key={row.id} value={row.id}>{row.customerName} · {money(row.availableCents)} · {new Date(row.occurredAt).toLocaleDateString("pt-BR")}</option>)}</select></label><Amount label="Valor a devolver do crediário" value={creditRefundValue} change={setCreditRefundValue} /><label>Motivo da devolução do crediário<textarea required minLength={3} maxLength={500} value={creditRefundNote} onChange={event => setCreditRefundNote(event.target.value)} /></label><button type="submit">Estornar pagamento do crediário</button></form> : <p className="proto-empty">Nenhum recebimento de crediário disponível para estorno.</p>}</Disclosure>
      </>}
      {section === "Contas e bancos" && <>
        <div className="finance-subnavigation"><Tabs items={["Contas a pagar e receber", "Bancos", "Cartões e Pix"]} value={accountsTab} onChange={setAccountsTab} /></div>
        {accountsTab === "Contas a pagar e receber" && <>
          <dl className="finance-summary"><div><dt>A pagar</dt><dd>{money(pendingTitles.filter(title => title.kind === "payable").reduce((sum, title) => sum + title.amountCents - title.settledCents, 0))}</dd></div><div><dt>A receber</dt><dd>{money(pendingTitles.filter(title => title.kind === "receivable").reduce((sum, title) => sum + title.amountCents - title.settledCents, 0))}</dd></div><div><dt>Contas vencidas</dt><dd>{pendingTitles.filter(title => title.dueDate < localDate()).length}<small> pendentes de baixa</small></dd></div></dl>
          <Panel title="Contas e vencimentos" subtitle="Selecione uma conta para registrar o pagamento ou recebimento.">
            <div className="finance-filters"><label className="finance-search">Buscar conta<input type="search" placeholder="Descrição ou categoria" value={titleSearch} onChange={event => setTitleSearch(event.target.value)} /></label><label><span id="finance-title-filter">Exibir contas</span><select aria-labelledby="finance-title-filter" value={titleFilter} onChange={event => setTitleFilter(event.target.value)}>{["Pendentes", "Vencidas", "Liquidadas", "Todas"].map(value => <option key={value}>{value}</option>)}</select></label></div>
            <div className="proto-table-wrap"><table><thead><tr><th>Conta</th><th>Tipo</th><th>Vencimento</th><th className="cash-number">Pendente</th><th>Situação</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{filteredTitles.map(title => <tr key={title.id} className={titleId === title.id ? "is-selected" : undefined}><td><strong>{title.description}</strong><small>{title.category} · Total {money(title.amountCents)}</small></td><td>{title.kind === "payable" ? "A pagar" : "A receber"}</td><td>{day(title.dueDate)}</td><td className="cash-number">{money(title.amountCents - title.settledCents)}</td><td><span className={`finance-status ${title.status === "settled" ? "is-settled" : title.dueDate < localDate() ? "is-overdue" : ""}`}>{title.status === "settled" ? "Liquidada" : title.dueDate < localDate() ? "Vencida" : title.status === "partial" ? "Parcial" : "Pendente"}</span></td><td>{title.status !== "settled" && <button type="button" className="proto-subtle" aria-label={`Baixar ${title.description}`} onClick={() => selectTitle(title.id)}>Registrar baixa</button>}</td></tr>)}</tbody></table></div>
            {!filteredTitles.length && <div className="finance-empty"><strong>{data.titles.length ? "Nenhuma conta neste filtro" : "Organize os próximos vencimentos"}</strong><p>{data.titles.length ? "Altere os filtros para consultar outras contas." : "Use Nova conta abaixo para cadastrar despesas e recebimentos externos às vendas."}</p></div>}
          </Panel>
          {activeTitle && activeTitle.status !== "settled" && <div ref={settlementRef} tabIndex={-1} className="finance-action-region"><Panel title={`Registrar baixa: ${activeTitle.description}`} subtitle={`Vencimento ${day(activeTitle.dueDate)} · Pendente ${money(activeTitle.amountCents - activeTitle.settledCents)}`}><form className="proto-stack" onSubmit={event => onSubmit(event, () => void submit(`titles/${titleId}/settle`, { amountCents: amount(settleAmount), paymentMethod: settleMethod, ...(settleMethod === "pix" ? { accountId } : {}) }, "Baixa registrada.", () => { setSettleAmount(""); setTitleId(""); }))}><div className="finance-form-grid"><Amount label="Valor da baixa" value={settleAmount} change={setSettleAmount} /><label><span id="finance-title-method">Forma da baixa</span><select aria-labelledby="finance-title-method" value={settleMethod} onChange={event => setSettleMethod(event.target.value)}><option value="cash">Dinheiro no caixa</option><option value="pix">Pix / conta bancária</option></select></label>{settleMethod === "pix" && <label><span id="finance-title-account">Conta bancária</span><select aria-labelledby="finance-title-account" required value={accountId} onChange={event => setAccountId(event.target.value)}>{accountOptions}</select></label>}</div><p className="proto-caption">Pode informar uma parte do valor. O restante continuará pendente.</p><div className="proto-toolbar"><button type="submit">Confirmar baixa</button><button type="button" className="proto-subtle" onClick={() => setTitleId("")}>Cancelar</button></div></form></Panel></div>}
          <Disclosure title="Nova conta a pagar ou receber" description="Cadastre um compromisso com valor e vencimento."><p className="proto-caption">Use para compromissos externos. Vendas e crediário já são acompanhados automaticamente.</p><form className="proto-stack" onSubmit={event => onSubmit(event, () => void submit("titles", { kind: titleKind, description, category, amountCents: amount(titleAmount), dueDate }, "Conta registrada.", () => { setDescription(""); setCategory(""); setTitleAmount(""); setTitleFilter("Pendentes"); }))}><div className="finance-form-grid"><label><span id="finance-title-kind">Tipo de conta</span><select aria-labelledby="finance-title-kind" value={titleKind} onChange={event => setTitleKind(event.target.value)}><option value="payable">A pagar</option><option value="receivable">A receber</option></select></label><label>Descrição<input required minLength={3} maxLength={200} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: compra de embalagens" /></label><label>Categoria<input required minLength={2} maxLength={80} value={category} onChange={event => setCategory(event.target.value)} placeholder="Ex.: fornecedores, aluguel" /></label><Amount label="Valor da conta" value={titleAmount} change={setTitleAmount} /><label>Vencimento<input type="date" required value={dueDate} onChange={event => setDueDate(event.target.value)} /></label></div><button type="submit">Registrar conta</button></form></Disclosure>
        </>}
        {accountsTab === "Bancos" && <>
          <Panel title="Saldos nas contas" subtitle="Saldos atuais calculados pelos lançamentos conciliados."><dl className="cash-facts finance-bank-list">{data.accounts.map(account => <div key={account.id}><dt><Landmark size={18} aria-hidden="true" />{account.name}</dt><dd>{money(account.balanceCents)}</dd></div>)}</dl>{!data.accounts.length && <div className="finance-empty"><Landmark size={24} aria-hidden="true" /><strong>Cadastre sua primeira conta bancária</strong><p>Depois, você poderá conciliar Pix, liquidar cartões e transferir valores entre contas.</p></div>}</Panel>
          <Disclosure title="Cadastrar conta bancária" description="Informe um nome para identificar a conta e o saldo inicial."><form className="proto-stack" onSubmit={event => onSubmit(event, () => void submit("accounts", { name: accountName, openingBalanceCents: amount(opening, true) }, "Conta bancária cadastrada.", () => { setAccountName(""); setOpening("0,00"); }))}><div className="finance-form-grid"><label>Nome da conta<input required minLength={2} maxLength={120} value={accountName} onChange={event => setAccountName(event.target.value)} placeholder="Ex.: conta principal da loja" /></label><Amount label="Saldo inicial" value={opening} change={setOpening} /></div><button type="submit">Cadastrar conta</button></form></Disclosure>
          <Disclosure title="Transferir entre contas" description="Movimente o saldo sem gerar receita ou despesa.">{data.accounts.length < 2 ? <p className="proto-caption">Cadastre pelo menos duas contas bancárias para registrar uma transferência.</p> : <form className="proto-stack" onSubmit={event => onSubmit(event, () => void submit("transfers", { fromAccountId: fromAccount, toAccountId: toAccount, amountCents: amount(transferAmount), note: transferNote }, "Transferência registrada.", () => { setTransferAmount(""); setTransferNote(""); }))}><div className="finance-form-grid"><label><span id="finance-transfer-from">Conta de origem</span><select aria-labelledby="finance-transfer-from" required value={fromAccount} onChange={event => setFromAccount(event.target.value)}>{accountOptions}</select></label><label><span id="finance-transfer-to">Conta de destino</span><select aria-labelledby="finance-transfer-to" required value={toAccount} onChange={event => setToAccount(event.target.value)}>{accountOptions}</select></label><Amount label="Valor da transferência" value={transferAmount} change={setTransferAmount} /><label>Justificativa<input required minLength={3} maxLength={500} value={transferNote} onChange={event => setTransferNote(event.target.value)} /></label></div><button type="submit">Registrar transferência</button></form>}</Disclosure>
        </>}
        {accountsTab === "Cartões e Pix" && <>
          <Panel title="Conciliação de recebimentos" subtitle="Confira o depósito na conta antes de confirmar. Pix mantém o valor recebido; cartões e vale permitem taxa."><div className="finance-filters"><label><span id="finance-card-filter">Exibir recebimentos</span><select aria-labelledby="finance-card-filter" value={cardFilter} onChange={event => setCardFilter(event.target.value)}>{["Pendentes", "Concluídos", "Todos"].map(value => <option key={value}>{value}</option>)}</select></label><p className="proto-caption">{filteredCards.length} recebimento(s)</p></div><div className="proto-table-wrap"><table><thead><tr><th>Recebimento</th><th className="cash-number">Bruto</th><th>Previsão</th><th className="cash-number">Taxa</th><th className="cash-number">Líquido</th><th>Situação</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{filteredCards.map(card => <tr key={card.id} className={cardId === card.id ? "is-selected" : undefined}><td><strong>{paymentLabels[card.paymentMethod as keyof typeof paymentLabels] ?? card.paymentMethod}</strong><small>#{card.id.slice(0, 8)} · {new Date(card.occurredAt).toLocaleDateString("pt-BR")}</small></td><td className="cash-number">{money(card.amountCents)}</td><td>{card.paymentMethod === "pix" ? "Disponível para conciliar" : card.dueDate ? day(card.dueDate) : "Não informada"}</td><td className="cash-number">{card.feeCents === null ? "A conferir" : money(card.feeCents)}</td><td className="cash-number">{card.netCents === null ? "A conferir" : money(card.netCents)}</td><td><span className={`finance-status ${card.settled ? "is-settled" : ""}`}>{card.settled ? "Concluído" : "Pendente"}</span></td><td>{!card.settled && card.refundableCents > 0 && <button type="button" className="proto-subtle" aria-label={`Conferir recebimento ${card.id.slice(0, 8)}`} onClick={() => selectCard(card.id)}>Conferir</button>}</td></tr>)}</tbody></table></div>{!filteredCards.length && <div className="finance-empty"><strong>Nenhum recebimento neste filtro</strong><p>Os pagamentos por Pix, cartão e vale aparecem aqui quando são registrados.</p></div>}</Panel>
          {activeCard && !activeCard.settled && <div ref={cardRef} tabIndex={-1} className="finance-action-region"><Panel title={`Conferir recebimento #${activeCard.id.slice(0, 8)}`} subtitle={`Saldo a conciliar: ${money(activeCard.refundableCents)}`}>{!data.accounts.length ? <p className="cash-feedback">Cadastre uma conta na aba Bancos para conciliar este recebimento.</p> : <div className="finance-form-grid">{activeCard.paymentMethod !== "pix" && <form className="proto-stack" onSubmit={event => { event.preventDefault(); void submit(`cards/${cardId}/schedule`, { dueDate: cardDate }, "Previsão atualizada."); }}><label>Previsão de liquidação<input type="date" required value={cardDate} onChange={event => setCardDate(event.target.value)} /></label><button type="submit" className="proto-subtle">Salvar previsão</button></form>}<form className="proto-stack" onSubmit={event => onSubmit(event, () => void submit(`cards/${cardId}/settle`, { accountId: cardAccount, feeCents: activeCard.paymentMethod === "pix" ? 0 : amount(fee, true) }, activeCard.paymentMethod === "pix" ? "Pix conciliado na conta." : "Liquidação registrada.", () => { setCardId(""); setFee("0,00"); }))}><label><span id="finance-card-account">Conta que recebeu</span><select aria-labelledby="finance-card-account" required value={cardAccount} onChange={event => setCardAccount(event.target.value)}>{accountOptions}</select></label>{activeCard.paymentMethod !== "pix" && <Amount label="Taxa descontada" value={fee} change={setFee} />}<p className="finance-payment-hint">Líquido a confirmar <strong>{money(activeCard.refundableCents - (activeCard.paymentMethod === "pix" ? 0 : parseCashAmount(fee) ?? 0))}</strong></p><button type="submit">{activeCard.paymentMethod === "pix" ? "Confirmar Pix na conta" : "Confirmar liquidação"}</button></form></div>}<button type="button" className="proto-subtle" onClick={() => setCardId("")}>Fechar conferência</button></Panel></div>}
        </>}
      </>}
      {section === "Fluxo financeiro" && <>
        <Panel title="Fluxo por período" subtitle="Recebimentos e pagamentos efetivos, com previsão dos próximos compromissos."><div className="finance-period-shortcuts" role="group" aria-label="Períodos rápidos"><button type="button" className="proto-subtle" disabled={flowBusy} onClick={() => choosePeriod(1)}>Hoje</button><button type="button" className="proto-subtle" disabled={flowBusy} onClick={() => choosePeriod(7)}>Últimos 7 dias</button><button type="button" className="proto-subtle" disabled={flowBusy} onClick={() => choosePeriod("month")}>Este mês</button><button type="button" className="proto-subtle" disabled={flowBusy} onClick={() => choosePeriod(30)}>Últimos 30 dias</button></div><form className="finance-period-form" onSubmit={event => void queryFlow(event)}><label>De<input type="date" required value={from} disabled={flowBusy} onChange={event => { setFrom(event.target.value); setFlow(null); }} /></label><label>Até<input type="date" required value={to} disabled={flowBusy} onChange={event => { setTo(event.target.value); setFlow(null); }} /></label><button type="submit" disabled={flowBusy}>{flowBusy ? "Consultando…" : "Consultar período"}</button></form></Panel>
        {flowBusy && <LoadingState title="Consultando período" description="Conferindo entradas, saídas e vencimentos." icon={LoaderCircle} />}
        {flow && !flowBusy && flowTotals && <>
          <dl className="finance-summary"><div><dt><ArrowDownLeft size={16} aria-hidden="true" />Entradas realizadas</dt><dd className="finance-positive">{money(flowTotals.incoming)}</dd></div><div><dt><ArrowUpRight size={16} aria-hidden="true" />Saídas realizadas</dt><dd>{money(flowTotals.outgoing)}</dd></div><div><dt>Saldo do período</dt><dd className={flowTotals.incoming - flowTotals.outgoing < 0 ? "finance-negative" : undefined}>{money(flowTotals.incoming - flowTotals.outgoing)}</dd></div><div><dt>Previsão líquida</dt><dd>{money(flowTotals.forecastIn - flowTotals.forecastOut)}</dd></div></dl>
          <Panel title="Realizado e previsto" subtitle={`${day(flow.from)} a ${day(flow.to)}. Cartões entram pelo líquido na liquidação; transferências não alteram este saldo.`}>
            {flow.days.length > 0 && <div className="finance-flow-chart" aria-label="Comparação de entradas e saídas por dia"><div className="finance-chart-legend"><span><i className="is-incoming" />Entradas</span><span><i className="is-outgoing" />Saídas</span><small>Até 14 dias com movimentação. Tabela completa abaixo.</small></div>{flow.days.slice(-14).map(row => { const max = Math.max(1, ...flow.days.slice(-14).flatMap(item => [item.incomingCents, item.outgoingCents])); return <div className="finance-chart-row" key={row.date}><span>{day(row.date).slice(0, 5)}</span><div aria-hidden="true"><span className="is-incoming" style={{ width: `${row.incomingCents / max * 100}%` }} /><span className="is-outgoing" style={{ width: `${row.outgoingCents / max * 100}%` }} /></div><span className="sr-only">Entradas {money(row.incomingCents)}, saídas {money(row.outgoingCents)}</span></div>; })}</div>}
            <div className="proto-table-wrap"><table><thead><tr><th>Data</th><th className="cash-number">Entradas</th><th className="cash-number">Saídas</th><th className="cash-number">Saldo do dia</th><th className="cash-number">Entradas previstas</th><th className="cash-number">Saídas previstas</th></tr></thead><tbody>{flow.days.map(row => <tr key={row.date}><td>{day(row.date)}</td><td className="cash-number">{money(row.incomingCents)}</td><td className="cash-number">{money(row.outgoingCents)}</td><td className="cash-number">{money(row.incomingCents - row.outgoingCents)}</td><td className="cash-number">{money(row.forecastIncomingCents)}</td><td className="cash-number">{money(row.forecastOutgoingCents)}</td></tr>)}</tbody><tfoot><tr><th>Total</th><td className="cash-number">{money(flowTotals.incoming)}</td><td className="cash-number">{money(flowTotals.outgoing)}</td><td className="cash-number">{money(flowTotals.incoming - flowTotals.outgoing)}</td><td className="cash-number">{money(flowTotals.forecastIn)}</td><td className="cash-number">{money(flowTotals.forecastOut)}</td></tr></tfoot></table></div>{!flow.days.length && <div className="finance-empty"><strong>Sem movimentações neste período</strong><p>Selecione outras datas ou registre recebimentos e contas para acompanhar o fluxo.</p></div>}
          </Panel>
          <Disclosure title="Saldos atuais e valores a receber" description="Consulte bancos, vendas pendentes, crediário e cartões, independentemente do período."><dl className="cash-facts">{flow.accounts.map(account => <div key={account.id}><dt>{account.name}</dt><dd>{money(account.balanceCents)}</dd></div>)}<div><dt>Vendas com saldo pendente</dt><dd>{money(flow.saleReceivableCents)}</dd></div><div><dt>Crediário a receber</dt><dd>{money(flow.creditReceivableCents)}</dd></div><div><dt>Cartões e vale a liquidar</dt><dd>{money(flow.cardReceivableCents)}</dd></div></dl><p className="proto-caption">Valores sem vencimento ficam fora da previsão diária. Taxas futuras não são presumidas.</p></Disclosure>
          <Disclosure title="Histórico financeiro do período" description={`${flow.movements.length} lançamento(s), incluindo transferências e liquidações.`}><div className="proto-table-wrap"><table><thead><tr><th>Data</th><th>Origem</th><th>Tipo</th><th className="cash-number">Valor</th><th>Observação</th></tr></thead><tbody>{flow.movements.map(row => <tr key={row.id}><td>{new Date(row.occurredAt).toLocaleString("pt-BR")}</td><td>{sourceNames[row.source] ?? row.source}</td><td>{{ receipt: "Recebimento", refund: "Estorno", expense: "Despesa", supply: "Suprimento", withdrawal: "Sangria", transfer_in: "Transferência recebida", transfer_out: "Transferência enviada", settlement: "Liquidação de cartão" }[row.kind] ?? row.kind}</td><td className="cash-number">{money(row.amountCents)}</td><td>{row.note || "—"}</td></tr>)}</tbody></table></div>{!flow.movements.length && <p className="proto-empty">Nenhum lançamento no período.</p>}</Disclosure>
        </>}
      </>}
    </fieldset>}
  </div>;
}
