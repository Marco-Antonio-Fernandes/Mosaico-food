import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { Panel, Tabs } from "@/components/shared/prototype-kit";
import { LoadingState } from "@/components/shared/ui-states";
import { closeCash, getCashHistory, getCashSnapshot, maskCashAmount, money, movementLabels, openCash, parseCashAmount, paymentLabels, registerCashMovement, type CashMovement, type CashMovementKind, type CashSession, type CashSnapshot } from "./cash-api";

const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateLabel = (value: string) => value.split("-").reverse().join("/");
const sourceLabels: Record<string, string> = { balcao: "Balcão", whatsapp: "WhatsApp", assistant: "Assistente", crediario: "Crediário", manual: "Lançamento manual", schedule: "Agendamento" };
const errorMessage = (error: unknown) => error instanceof TypeError && /fetch|network/i.test(error.message) ? "Não foi possível acessar o backend. Confira a conexão e tente novamente." : error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.";
type ClosingReview = { sessionId: string; countedCashCents: number; expectedCashCents: number; notes: string };

function AmountField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label>{label} (R$)<input required disabled={disabled} maxLength={24} inputMode="numeric" autoComplete="off" value={value} onChange={event => onChange(maskCashAmount(event.target.value))} placeholder="0,00" /></label>;
}
function MovementTable({ movements, count }: { movements: CashMovement[]; count: number }) {
  if (!count) return <p className="proto-empty">Nenhuma movimentação registrada. Os recebimentos das vendas aparecerão aqui automaticamente.</p>;
  return <><div className="proto-table-wrap"><table className="cash-movements"><thead><tr><th>Data</th><th>Movimentação e origem</th><th>Forma</th><th className="cash-number">Valor</th></tr></thead><tbody>{movements.map(entry => {
    const incoming = entry.kind === "receipt" || entry.kind === "supply";
    return <tr key={entry.id}><td>{dateTime(entry.occurredAt)}</td><td><strong>{movementLabels[entry.kind]}</strong><small>{sourceLabels[entry.source] ?? entry.source}{entry.note ? ` · ${entry.note}` : ""}</small><details><summary>Ver referência</summary><span>{entry.referenceType === "order" ? "Pedido" : entry.referenceType === "credit_payment" ? "Recebimento de crediário" : "Operação"}: {entry.referenceId}</span></details></td><td>{paymentLabels[entry.paymentMethod]}</td><td className={`cash-number ${incoming ? "cash-incoming" : ""}`}>{incoming ? "+" : "−"}{money(entry.amountCents)}</td></tr>;
  })}</tbody></table></div><p className="proto-caption">{movements.length < count ? `Exibindo as últimas ${movements.length} de ${count} movimentações. Os totais incluem todas.` : `${count} movimentaç${count === 1 ? "ão" : "ões"}.`}</p></>;
}
function ReceiptTotals({ totals, digitalOnly = false }: { totals: CashSnapshot["totals"]; digitalOnly?: boolean }) {
  return <dl className="cash-facts">{(Object.keys(paymentLabels) as Array<keyof typeof paymentLabels>).filter(key => !digitalOnly || key !== "cash").map(key => <div key={key}><dt>{paymentLabels[key]}</dt><dd>{money(totals[key])}</dd></div>)}</dl>;
}
export function CashPage() {
  const [tab, setTab] = useState("Caixa do dia");
  const [historyId, setHistoryId] = useState("");
  const [history, setHistory] = useState<CashSession[]>([]);
  const [snapshot, setSnapshot] = useState<CashSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<CashMovementKind>("supply");
  const [note, setNote] = useState("");
  const [counted, setCounted] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [review, setReview] = useState<ClosingReview | null>(null);
  const request = useRef(0);
  const savingRef = useRef(false);
  const operationId = useRef(crypto.randomUUID());
  const statusRef = useRef<HTMLParagraphElement>(null);
  const isToday = tab === "Caixa do dia";
  const session = snapshot?.session;
  const canOperate = isToday && session?.status === "open" && !loadError && !loading;

  const load = useCallback(async (quiet = false) => {
    const id = ++request.current;
    if (!quiet) setLoading(true);
    setRefreshing(true);
    try {
      const [nextSnapshot, nextHistory] = tab === "Histórico"
        ? await Promise.all([historyId ? getCashSnapshot(historyId) : Promise.resolve(null), getCashHistory()])
        : [await getCashSnapshot(), null];
      if (id !== request.current) return;
      setSnapshot(nextSnapshot);
      if (nextHistory) setHistory(nextHistory);
      setLoadError("");
    } catch (error) {
      if (id === request.current) setLoadError(errorMessage(error));
    } finally {
      if (id === request.current) { setLoading(false); setRefreshing(false); }
    }
  }, [tab, historyId]);
  useEffect(() => {
    void load();
    const interval = isToday ? window.setInterval(() => { if (!savingRef.current) void load(true); }, 15000) : undefined;
    return () => { ++request.current; if (interval) window.clearInterval(interval); };
  }, [load, isToday]);
  useEffect(() => { if (notice || actionError) statusRef.current?.focus(); }, [notice, actionError]);

  function navigate(value: string) {
    if (savingRef.current) return;
    setSnapshot(null); setTab(value); setHistoryId(""); setLoadError(""); setActionError(""); setNotice(""); setReview(null);
  }
  function changeMovement(change: () => void) { change(); operationId.current = crypto.randomUUID(); setActionError(""); }
  async function perform(action: () => Promise<unknown>, success: string, reset: () => void) {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setActionError(""); setNotice("");
    ++request.current;
    try {
      await action(); reset(); setNotice(success); await load(true);
    } catch (error) {
      setActionError(errorMessage(error)); setReview(null); await load(true);
    } finally { savingRef.current = false; setSaving(false); }
  }
  function open(event: FormEvent) {
    event.preventDefault();
    const cents = parseCashAmount(opening);
    if (cents === null) { setActionError("Informe um saldo inicial de até R$ 1.000.000,00."); return; }
    void perform(() => openCash(cents), "Caixa aberto. Os recebimentos em dinheiro já podem ser registrados.", () => setOpening(""));
  }
  function register(event: FormEvent) {
    event.preventDefault();
    const cents = parseCashAmount(amount);
    if (cents === null || cents === 0 || note.trim().length < 3) { setActionError("Informe um valor maior que zero e uma justificativa de pelo menos três caracteres."); return; }
    void perform(() => registerCashMovement({ operationId: operationId.current, kind, amountCents: cents, note: note.trim() }), "Movimentação registrada no caixa.", () => { setAmount(""); setNote(""); operationId.current = crypto.randomUUID(); });
  }
  function reviewClosing(event: FormEvent) {
    event.preventDefault();
    const cents = parseCashAmount(counted);
    if (!session || !snapshot || cents === null) { setActionError("Informe o dinheiro contado no caixa, até R$ 1.000.000,00."); return; }
    if (cents !== snapshot.expectedCashCents && !closingNotes.trim()) { setActionError("Informe uma justificativa para a diferença entre o dinheiro esperado e o contado."); return; }
    setActionError("");
    setReview({ sessionId: session.id, countedCashCents: cents, expectedCashCents: snapshot.expectedCashCents, notes: closingNotes.trim() });
  }

  return <div className="cash-page">
    <div className="cash-navigation"><Tabs items={["Caixa do dia", "Histórico"]} value={tab} onChange={navigate} /><button type="button" className="proto-subtle" disabled={refreshing || saving} onClick={() => void load(true)}><RefreshCw size={16} aria-hidden="true" />{refreshing ? "Atualizando…" : "Atualizar caixa"}</button></div>
    {loadError && <div role="alert" className="cash-feedback is-error"><p>{loadError}</p><button type="button" className="proto-subtle" disabled={refreshing || saving} onClick={() => void load()}>Tentar novamente</button></div>}
    {(notice || actionError) && <p ref={statusRef} tabIndex={-1} role={actionError ? "alert" : "status"} className={`cash-feedback ${actionError ? "is-error" : "is-success"}`}>{actionError || notice}</p>}
    {loading ? <LoadingState title="Carregando caixa" description="Consultando as movimentações registradas." icon={Wallet} /> : <>
      {!isToday && <Panel title="Histórico de caixas" subtitle="Selecione um caixa para consultar sua conferência.">
        {!history.length ? <p className="proto-empty">Os caixas aparecerão aqui após a primeira abertura.</p> : <><div className="proto-table-wrap"><table><thead><tr><th>Data</th><th>Situação</th><th className="cash-number">Dinheiro esperado</th><th className="cash-number">Diferença</th><th>Conferência</th></tr></thead><tbody>{history.map(item => <tr key={item.id}><td>{dateLabel(item.businessDate)}</td><td>{item.status === "open" ? "Aberto" : "Fechado"}</td><td className="cash-number">{item.status === "closed" && item.expectedCashCents !== null ? money(item.expectedCashCents) : "Em andamento"}</td><td className="cash-number">{item.differenceCents === null ? "A conferir" : money(item.differenceCents)}</td><td><button type="button" className="proto-subtle" aria-pressed={item.id === historyId} onClick={() => { setSnapshot(null); setHistoryId(item.id); setLoadError(""); }}>Conferir {dateLabel(item.businessDate)}</button></td></tr>)}</tbody></table></div><p className="proto-caption">Últimos {history.length} caixas.</p></>}
      </Panel>}
      {snapshot && !session && isToday && !loadError && <Panel title="Abrir caixa" subtitle="Informe o dinheiro físico disponível para troco. Os recebimentos digitais são registrados mesmo sem caixa aberto."><form className="cash-inline-form" onSubmit={open}><AmountField label="Saldo inicial" value={opening} onChange={setOpening} disabled={saving} /><button type="submit" disabled={saving}>{saving ? "Abrindo…" : "Abrir caixa"}</button></form></Panel>}
      {snapshot && session && <>
        <div className="cash-session-heading"><div><span className="proto-badge">{session.status === "open" ? "Caixa aberto" : "Caixa fechado"}</span><h2>Conferência de {dateLabel(session.businessDate)}</h2><p>Aberto em {dateTime(session.openedAt)}{session.closedAt ? ` · Fechado em ${dateTime(session.closedAt)}` : ""}</p></div>{!isToday && <span className="proto-caption">Consulta do histórico</span>}</div>
        {snapshot.legacySaleCount > 0 && <p className="cash-feedback">Este caixa inclui {snapshot.legacySaleCount} registro(s) anterior(es) ao novo controle. Confira o histórico de vendas antes de conciliar esses valores.</p>}
        <div className="cash-workspace"><div className="cash-main"><Panel title="Dinheiro físico" subtitle="Conferência do dinheiro na gaveta."><dl className="cash-facts"><div><dt>Saldo inicial</dt><dd>{money(snapshot.cashBreakdown.openingCashCents)}</dd></div><div><dt>Recebimentos em dinheiro</dt><dd>+{money(snapshot.cashBreakdown.receiptsCents)}</dd></div><div><dt>Estornos em dinheiro</dt><dd>−{money(snapshot.cashBreakdown.refundsCents)}</dd></div><div><dt>Suprimentos</dt><dd>+{money(snapshot.cashBreakdown.suppliesCents)}</dd></div><div><dt>Sangrias</dt><dd>−{money(snapshot.cashBreakdown.withdrawalsCents)}</dd></div><div><dt>Despesas em dinheiro</dt><dd>−{money(snapshot.cashBreakdown.expensesCents)}</dd></div><div className="cash-total"><dt>Dinheiro esperado</dt><dd>{money(snapshot.expectedCashCents)}</dd></div>{session.status === "closed" && <><div><dt>Dinheiro contado</dt><dd>{money(session.countedCashCents ?? 0)}</dd></div><div><dt>Diferença no fechamento</dt><dd>{money(session.differenceCents ?? 0)}</dd></div></>}</dl>{session.notes && <p className="cash-note">Justificativa: {session.notes}</p>}</Panel>
          <Panel title="Recebimentos por forma" subtitle="Valores registrados durante este caixa, de todas as origens de venda."><ReceiptTotals totals={snapshot.totals} /><p className="proto-caption">Cartões e vale-alimentação aguardam conferência de liquidação. Venda a prazo só entra como recebimento quando o cliente paga.</p></Panel></div>
          {canOperate && <div className="cash-actions"><Panel title="Nova movimentação" subtitle="Registre entradas e retiradas de dinheiro com justificativa."><form className="proto-stack" onSubmit={register}><fieldset disabled={saving || Boolean(review)}><label><span id="cash-movement-kind-label">Tipo de movimentação</span><select aria-labelledby="cash-movement-kind-label" value={kind} onChange={event => changeMovement(() => setKind(event.target.value as CashMovementKind))}><option value="supply">Suprimento (entrada para troco)</option><option value="withdrawal">Sangria (retirada de dinheiro)</option><option value="expense">Despesa paga em dinheiro</option></select></label><AmountField label="Valor da movimentação" value={amount} onChange={value => changeMovement(() => setAmount(value))} /><label><span id="cash-movement-note-label">Justificativa</span><textarea aria-labelledby="cash-movement-note-label" required minLength={3} maxLength={500} rows={2} value={note} onChange={event => changeMovement(() => setNote(event.target.value))} placeholder="Ex.: retirada para depósito" /></label><button type="submit">{saving ? "Registrando…" : "Registrar movimentação"}</button></fieldset></form></Panel>
            <Panel title="Fechar caixa" subtitle="Conte somente o dinheiro físico. Confira os recebimentos digitais ao lado.">{review ? <div className="cash-closing-review" role="region" aria-label="Revisão do fechamento"><h3>Confira antes de fechar</h3><dl className="cash-facts"><div><dt>Dinheiro esperado</dt><dd>{money(review.expectedCashCents)}</dd></div><div><dt>Dinheiro contado</dt><dd>{money(review.countedCashCents)}</dd></div><div><dt>Diferença</dt><dd>{money(review.countedCashCents - review.expectedCashCents)}</dd></div></dl>{review.notes && <p>{review.notes}</p>}<p>Após a confirmação, esta sessão fica encerrada. A próxima abertura será em outra data.</p><div className="proto-toolbar"><button type="button" disabled={saving} onClick={() => void perform(() => closeCash(review), "Caixa fechado. A conferência foi salva no histórico.", () => { setReview(null); setCounted(""); setClosingNotes(""); })}>{saving ? "Fechando…" : "Confirmar fechamento"}</button><button type="button" className="proto-subtle" disabled={saving} onClick={() => setReview(null)}>Voltar à contagem</button></div></div> : <form className="proto-stack" onSubmit={reviewClosing}><fieldset disabled={saving}><AmountField label="Dinheiro contado" value={counted} onChange={setCounted} /><label><span id="cash-closing-note-label">Justificativa da diferença</span><textarea aria-labelledby="cash-closing-note-label" maxLength={500} rows={2} value={closingNotes} onChange={event => setClosingNotes(event.target.value)} placeholder="Obrigatória quando houver diferença" /></label><button type="submit">Conferir fechamento</button></fieldset></form>}</Panel></div>}
        </div>
        {isToday && session.status === "closed" && <p className="cash-feedback">O caixa desta data já foi fechado. Recebimentos digitais posteriores ficam registrados abaixo, sem alterar este fechamento.</p>}
        <Panel title="Movimentações do caixa" subtitle="Cada lançamento identifica sua origem e operação."><MovementTable movements={snapshot.movements} count={snapshot.movementCount} /></Panel>
      </>}
      {isToday && snapshot?.unassigned && <Panel title="Recebimentos digitais fora do caixa" subtitle={`Registrados em ${dateLabel(snapshot.unassigned.date)}, quando não havia sessão aberta.`}>{snapshot.unassigned.movementCount ? <><ReceiptTotals totals={snapshot.unassigned.totals} digitalOnly /><MovementTable movements={snapshot.unassigned.movements} count={snapshot.unassigned.movementCount} /></> : <p className="proto-empty">Nenhum recebimento digital fora do caixa nesta data.</p>}</Panel>}
    </>}
  </div>;
}
