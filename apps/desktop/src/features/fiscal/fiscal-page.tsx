import { useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, ExternalLink, FileText, LoaderCircle, RefreshCw, Send, Settings2 } from "lucide-react";
import { Metrics, Panel, Tabs } from "@/components/shared/prototype-kit";
import { LoadingState } from "@/components/shared/ui-states";
import {
  getFoodFiscalDocuments,
  getFoodFiscalSources,
  getFoodFiscalStatus,
  getFoodNotasemtupeStatus,
  issueFoodFiscalDocument,
  type FoodFiscalBuyer,
  type FoodFiscalDocument,
  type FoodFiscalSource,
  type FoodFiscalStatus,
  type FoodNotasemtupeStatus,
} from "@/lib/food-api";

type FiscalTab = "Vendas para emitir" | "Histórico" | "Configuração";

type BuyerDraft = {
  document: string;
  name: string;
  email: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  ibge: string;
  uf: string;
  cep: string;
};

const emptyBuyer: BuyerDraft = { document: "", name: "", email: "", street: "", number: "", neighborhood: "", city: "", ibge: "", uf: "PR", cep: "" };

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function sourceLabel(source: FoodFiscalSource) {
  return source.sourceType === "counter_sale" ? "Venda do balcão" : "Item de pedido";
}

  function paymentLabel(value: string | null) {
  return ({ pix: "Pix", cash: "Dinheiro", card_credit: "Cartão de crédito", card_debit: "Cartão de débito", meal_voucher: "Vale-alimentação", crediario: "Crediário", brinde: "Brinde" }[value ?? ""] ?? value ?? "Pagamento não informado");
}

function documentStatusLabel(document: FoodFiscalDocument | null) {
  if (!document) return "Ainda não emitida";
  if (document.status === "issued") return "Autorizada";
  if (document.status === "pending") return "Processando";
  if (document.status === "cancelled") return "Cancelada";
  return "Com erro";
}

function documentStatusClass(document: FoodFiscalDocument | null) {
  if (!document) return "is-neutral";
  if (document.status === "issued") return "is-success";
  if (document.status === "pending") return "is-pending";
  return "is-error";
}

function modelLabel(model: number | undefined) {
  return model === 55 ? "NF-e · modelo 55" : "NFC-e · modelo 65";
}

function buildBuyer(draft: BuyerDraft): FoodFiscalBuyer | undefined {
  const hasAny = Object.entries(draft).some(([key, value]) => key !== "uf" && value.trim());
  if (!hasAny) return undefined;
  const buyer: FoodFiscalBuyer = {};
  if (draft.document.trim()) buyer.document = draft.document.trim();
  if (draft.name.trim()) buyer.name = draft.name.trim();
  if (draft.email.trim()) buyer.email = draft.email.trim();
  const addressFields = [draft.street, draft.number, draft.neighborhood, draft.city, draft.ibge, draft.cep].map(value => value.trim());
  if (addressFields.some(Boolean)) {
    buyer.address = {
      street: draft.street.trim(),
      number: draft.number.trim(),
      neighborhood: draft.neighborhood.trim(),
      city: draft.city.trim(),
      ibge: Number(draft.ibge),
      uf: draft.uf.trim().toUpperCase(),
      cep: draft.cep.replace(/\D/g, ""),
    };
  }
  return buyer;
}

export function FiscalPage() {
  const [tab, setTab] = useState<FiscalTab>("Vendas para emitir");
  const [status, setStatus] = useState<FoodFiscalStatus | null>(null);
  const [notasemtupe, setNotasemtupe] = useState<FoodNotasemtupeStatus | null>(null);
  const [sources, setSources] = useState<FoodFiscalSource[]>([]);
  const [documents, setDocuments] = useState<FoodFiscalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<FoodFiscalSource | null>(null);
  const [buyer, setBuyer] = useState<BuyerDraft>(emptyBuyer);
  const [issuing, setIssuing] = useState(false);

  const load = async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const [statusResult, sourcesResult, documentsResult, notasemtupeResult] = await Promise.allSettled([getFoodFiscalStatus(), getFoodFiscalSources(), getFoodFiscalDocuments(), getFoodNotasemtupeStatus()]);
      if (sourcesResult.status === "rejected") throw sourcesResult.reason;
      const nextSources = sourcesResult.value;
      const nextStatus = statusResult.status === "fulfilled" ? statusResult.value : null;
      const nextDocuments = documentsResult.status === "fulfilled" ? documentsResult.value : [];
      const nextNotasemtupe = notasemtupeResult.status === "fulfilled" ? notasemtupeResult.value : {
        configured: false,
        reachable: false,
        authenticated: false,
        baseUrl: "http://127.0.0.1:4173",
        company: null,
        error: "Backend local indisponível para consultar o not@sem tupe.",
      } satisfies FoodNotasemtupeStatus;
      const documentBySource = new Map(nextDocuments.map(document => [`${document.sourceType}:${document.sourceId}`, document]));
      setStatus(nextStatus);
      setNotasemtupe(nextNotasemtupe);
      setSources(nextSources.map(source => ({ ...source, document: documentBySource.get(`${source.sourceType}:${source.sourceId}`) ?? source.document ?? null })));
      setDocuments(nextDocuments);
      const remoteError = statusResult.status === "rejected" ? statusResult.reason : documentsResult.status === "rejected" ? documentsResult.reason : null;
      if (remoteError) throw remoteError;
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o módulo fiscal.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const waitingSources = useMemo(() => sources.filter(source => source.document?.status !== "issued"), [sources]);
  const issuedCount = documents.filter(document => document.status === "issued").length;
  const reviewCount = documents.filter(document => document.status === "error").length;

  function openIssue(source: FoodFiscalSource) {
    setSelected(source);
    setBuyer({ ...emptyBuyer, uf: status?.uf || "PR" });
    setNotice("");
    setError("");
  }

  function updateBuyer(field: keyof BuyerDraft, value: string) {
    setBuyer(current => ({ ...current, [field]: value }));
  }

  async function issue() {
    if (!selected || !status?.configured || !selected.fiscal.ready || issuing) return;
    setIssuing(true);
    setError("");
    setNotice("");
    try {
      const result = await issueFoodFiscalDocument({
        sourceType: selected.sourceType,
        sourceId: selected.sourceId,
        productId: selected.productId,
        quantity: selected.quantity,
        paymentMethod: selected.paymentMethod,
        buyer: buildBuyer(buyer),
        sourceSnapshot: selected.product ? {
          product: selected.product,
          quantity: selected.quantity,
          unitPriceCents: selected.quantity > 0 ? Math.round(selected.totalCents / selected.quantity) : 0,
          totalCents: selected.totalCents,
          paymentMethod: selected.paymentMethod,
          paymentStatus: "paid",
          fulfillment: selected.fulfillment ?? "pickup",
        } : undefined,
      });
      const document = result.document;
      setSources(current => current.map(source => source.sourceId === selected.sourceId ? { ...source, document } : source));
      setDocuments(current => [document, ...current.filter(item => item.id !== document.id)]);
      setSelected(null);
      const centralMessage = result.integration.synced
        ? (result.integration.duplicate ? " A centralização já existia no not@sem tupe." : " Também foi enviada ao not@sem tupe.")
        : result.integration.skipped
          ? " O not@sem tupe ainda não está configurado."
          : ` ${result.integration.message}`;
      setNotice(document.status === "issued" ? `Nota autorizada e salva no histórico.${centralMessage}` : `A nota foi enviada para processamento.${centralMessage}`);
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Não foi possível emitir a nota.");
    } finally {
      setIssuing(false);
    }
  }

  return <div className="fiscal-page">
    <section className="fiscal-overview">
      <div>
        <span className="fiscal-kicker">Emissão fiscal</span>
        <h2>{modelLabel(status?.model)}</h2>
        <p>A emissão é opcional: selecione uma venda paga e clique em emitir somente quando o fiscal decidir. O fechamento da venda nunca gera nota sozinho.</p>
      </div>
      <div className={`fiscal-provider-status ${status?.configured ? "is-ready" : "is-missing"}`}>
        {status?.configured ? <CircleCheck size={19} /> : <CircleAlert size={19} />}
        <div><strong>{status?.configured ? "Integração pronta" : "Aguardando chave da API"}</strong><small>{status?.configured ? "Notaas conectada ao backend" : "Preencha NOTAAS_API_KEY no servidor"}</small></div>
      </div>
    </section>

    <Metrics items={[
      ["Ambiente", status ? status.environment === "production" ? "Produção" : "Homologação" : "—", status ? `${status.uf} · ${modelLabel(status.model)}` : "Carregando configuração"],
      ["Para emitir", String(waitingSources.length), "Vendas pagas disponíveis"],
      ["Autorizadas", String(issuedCount), reviewCount ? `${reviewCount} para revisar` : "Sem rejeições registradas"],
    ]} />

    <Tabs items={["Vendas para emitir", "Histórico", "Configuração"]} value={tab} onChange={value => setTab(value as FiscalTab)} />
    {error && <div className="fiscal-feedback is-error" role="alert"><CircleAlert size={17} /><span>{error}</span><button type="button" className="proto-subtle" onClick={() => void load(true)}>Tentar novamente</button></div>}
    {notice && <div className="fiscal-feedback is-success" role="status"><CircleCheck size={17} /><span>{notice}</span></div>}

    {tab === "Configuração" ? <FiscalConfiguration status={status} notasemtupe={notasemtupe} onRefresh={() => void load(true)} refreshing={refreshing} /> : loading ? <LoadingState icon={LoaderCircle} title="Carregando fiscal" description="Buscando vendas pagas e documentos emitidos." /> : tab === "Histórico" ? <FiscalHistory documents={documents} /> : <FiscalSources sources={waitingSources} configured={Boolean(status?.configured)} onIssue={openIssue} onConfiguration={() => setTab("Configuração")} />}

    {selected && <FiscalIssueModal source={selected} status={status} buyer={buyer} issuing={issuing} onBuyerChange={updateBuyer} onClose={() => setSelected(null)} onIssue={() => void issue()} />}
  </div>;
}

function FiscalSources({ sources, configured, onIssue, onConfiguration }: { sources: FoodFiscalSource[]; configured: boolean; onIssue: (source: FoodFiscalSource) => void; onConfiguration: () => void }) {
  return <Panel title="Vendas pagas disponíveis" subtitle="A emissão é separada do fechamento da venda. Confira o perfil fiscal antes de enviar cada documento.">
    {sources.length ? <div className="fiscal-source-list">{sources.map(source => <article className="fiscal-source-card" key={`${source.sourceType}:${source.sourceId}`}>
      <div className="fiscal-source-heading"><div><span className="fiscal-source-kind">{sourceLabel(source)}</span><h3>{source.productName}</h3><small>{source.quantity} unidade{source.quantity === 1 ? "" : "s"} · {paymentLabel(source.paymentMethod)} · {dateTime(source.createdAt)}</small></div><strong>{money(source.totalCents)}</strong></div>
      <div className="fiscal-source-meta"><span className={source.fiscal.ready ? "fiscal-check is-ready" : "fiscal-check is-missing"}>{source.fiscal.ready ? <CircleCheck size={15} /> : <CircleAlert size={15} />}{source.fiscal.ready ? "Perfil fiscal completo" : `Faltam ${source.fiscal.missing.length} dados`}</span>{source.document && <span className={`fiscal-check ${documentStatusClass(source.document)}`}>{documentStatusLabel(source.document)}</span>}</div>
      {!source.fiscal.ready && <small className="fiscal-missing-list">{source.fiscal.missing.map(item => item.message).join(" ")}</small>}
      <div className="fiscal-source-actions">{!configured ? <button type="button" className="proto-subtle" onClick={onConfiguration}><Settings2 size={15} />Configurar integração</button> : source.fiscal.ready && (!source.document || source.document.status === "error") ? <button type="button" onClick={() => onIssue(source)}><Send size={15} />{source.document?.status === "error" ? "Tentar novamente" : "Emitir nota"}</button> : source.document?.status === "pending" ? <span className="fiscal-action-note"><LoaderCircle size={15} />Aguardando provedor</span> : <span className="fiscal-action-note">Corrija o cadastro para emitir</span>}</div>
    </article>)}</div> : <div className="fiscal-empty"><FileText size={26} /><strong>Nenhuma venda paga aguardando emissão</strong><p>As vendas finalizadas e pagas aparecerão aqui para emissão manual.</p></div>}
  </Panel>;
}

function FiscalHistory({ documents }: { documents: FoodFiscalDocument[] }) {
  return <Panel title="Histórico fiscal" subtitle="Documentos emitidos, processando e rejeitados permanecem registrados para conferência.">
    {documents.length ? <div className="fiscal-history-list">{documents.map(document => <article className="fiscal-history-row" key={document.id}>
      <div className="fiscal-history-icon"><FileText size={18} /></div>
      <div className="fiscal-history-main"><strong>{document.number ? `${document.model === 55 ? "NF-e" : "NFC-e"} nº ${document.number}` : `${modelLabel(document.model)} · emissão`}</strong><small>{document.productName} · {document.quantity} unidade{document.quantity === 1 ? "" : "s"} · {dateTime(document.createdAt)}</small>{document.errorMessage && <small className="fiscal-history-error">{document.errorMessage}</small>}</div>
      <div className="fiscal-history-side"><span className={`fiscal-check ${documentStatusClass(document)}`}>{documentStatusLabel(document)}</span><strong>{money(document.totalCents)}</strong><div className="fiscal-links">{document.pdfUrl && <a href={document.pdfUrl} target="_blank" rel="noreferrer">DANFE <ExternalLink size={13} /></a>}{document.xmlUrl && <a href={document.xmlUrl} target="_blank" rel="noreferrer">XML <ExternalLink size={13} /></a>}{document.publicUrl && <a href={document.publicUrl} target="_blank" rel="noreferrer">Consulta <ExternalLink size={13} /></a>}</div></div>
    </article>)}</div> : <div className="fiscal-empty"><FileText size={26} /><strong>Histórico vazio</strong><p>As notas autorizadas aparecerão aqui.</p></div>}
  </Panel>;
}

function FiscalConfiguration({ status, notasemtupe, onRefresh, refreshing }: { status: FoodFiscalStatus | null; notasemtupe: FoodNotasemtupeStatus | null; onRefresh: () => void; refreshing: boolean }) {
  return <div className="fiscal-configuration-grid">
    <Panel title="Conexão com a Notaas" subtitle="A chave fica somente no backend remoto. O aplicativo desktop nunca recebe o segredo.">
      <div className={`fiscal-config-callout ${status?.configured ? "is-ready" : "is-missing"}`}><span>{status?.configured ? "✓" : "!"}</span><div><strong>{status?.configured ? "Chave detectada" : "Chave ainda não configurada"}</strong><p>{status?.configured ? "O backend está pronto para enviar emissões ao provedor." : "Depois que você preencher NOTAAS_API_KEY, reinicie o backend e clique em atualizar status."}</p></div></div>
      <div className="fiscal-env-block"><code>Backend remoto: mosaico.rotatix.com.br</code><code>NOTAAS_API_KEY="configurada no servidor"</code><code>NOTAAS_BASE_URL="https://platform.notaas.com.br/api/v1"</code><code>FOOD_FISCAL_MODEL="65"</code><code>FOOD_FISCAL_ENVIRONMENT="homologation"</code><code>FOOD_FISCAL_UF="{status?.uf || "PR"}"</code><code>FOOD_FISCAL_CRT="{status?.crt ?? 4}" · {status?.crt === 4 ? "MEI" : "Simples Nacional"}</code></div>
      <div className="proto-toolbar fiscal-config-actions"><button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? <LoaderCircle size={15} className="fiscal-spin" /> : <RefreshCw size={15} />}Atualizar status</button><span className="proto-caption">Modelo atual: {modelLabel(status?.model)}</span></div>
      <div className="fiscal-config-divider" />
      <div className="fiscal-config-section-heading"><strong>Central not@sem tupe</strong><span>Sincroniza a nota depois do retorno fiscal.</span></div>
      <div className={`fiscal-config-callout ${notasemtupe?.authenticated ? "is-ready" : "is-missing"}`}><span>{notasemtupe?.authenticated ? "✓" : "!"}</span><div><strong>{notasemtupe?.authenticated ? "Conectado" : notasemtupe?.configured ? "Token configurado, mas sem conexão" : "Aguardando token"}</strong><p>{notasemtupe?.company ? `Empresa: ${notasemtupe.company.name} · CNPJ ${notasemtupe.company.cnpj}` : notasemtupe?.error || "Configure NOTASEMTUPE_TOKEN no backend local."}</p></div></div>
      <div className="fiscal-env-block"><code>Servidor: {notasemtupe?.baseUrl || "http://127.0.0.1:4173"}</code><code>Sincronização: após autorização fiscal</code><code>Token: somente no backend local</code></div>
    </Panel>
    <Panel title="Antes da primeira emissão" subtitle="Checklist para homologação">
      <ul className="fiscal-checklist"><li><CircleCheck size={16} />Preencha os dados fiscais de cada produto que será vendido.</li><li><CircleCheck size={16} />Confirme NCM, CFOP, origem e CST/CSOSN com o contador.</li><li><CircleCheck size={16} />Teste em homologação antes de mudar para produção.</li><li><CircleCheck size={16} />A emissão nesta tela só aparece para vendas pagas.</li></ul>
    </Panel>
  </div>;
}

function FiscalIssueModal({ source, status, buyer, issuing, onBuyerChange, onClose, onIssue }: { source: FoodFiscalSource; status: FoodFiscalStatus | null; buyer: BuyerDraft; issuing: boolean; onBuyerChange: (field: keyof BuyerDraft, value: string) => void; onClose: () => void; onIssue: () => void }) {
  const requiresAddress = status?.model === 55;
  const canIssue = Boolean(
    status?.configured &&
    source.fiscal.ready &&
    (!requiresAddress || (
      buyer.document.trim() &&
      buyer.name.trim() &&
      buyer.street.trim() &&
      buyer.number.trim() &&
      buyer.neighborhood.trim() &&
      buyer.city.trim() &&
      /^\d{7}$/.test(buyer.ibge.trim()) &&
      buyer.uf.trim().length === 2 &&
      /^\d{8}$/.test(buyer.cep.replace(/\D/g, ""))
    )),
  );
  return <div className="fiscal-modal-backdrop" role="presentation"><section className="fiscal-issue-modal" role="dialog" aria-modal="true" aria-labelledby="fiscal-issue-title">
    <header className="fiscal-issue-header"><div><span className="fiscal-kicker">Assistente de emissão</span><h2 id="fiscal-issue-title">Emitir {modelLabel(status?.model)}</h2><p>{source.productName} · {source.quantity} unidade{source.quantity === 1 ? "" : "s"} · {money(source.totalCents)}</p></div><button type="button" className="proto-subtle fiscal-close" onClick={onClose} aria-label="Fechar">×</button></header>
    <div className="fiscal-issue-warning"><CircleAlert size={17} /><span>A venda já está paga. A emissão fiscal não altera estoque, caixa ou o pedido.</span></div>
    <div className="fiscal-buyer-grid">
      <label>CPF/CNPJ do consumidor<input inputMode="numeric" value={buyer.document} onChange={event => onBuyerChange("document", event.target.value)} placeholder="Opcional na NFC-e" /></label>
      <label>Nome do consumidor<input value={buyer.name} onChange={event => onBuyerChange("name", event.target.value)} placeholder={requiresAddress ? "Obrigatório na NF-e" : "Opcional"} /></label>
      <label>E-mail <span className="food-fiscal-optional">opcional</span><input type="email" value={buyer.email} onChange={event => onBuyerChange("email", event.target.value)} placeholder="Para receber o documento" /></label>
    </div>
    <details className="fiscal-address-details" open={requiresAddress}><summary>Endereço do destinatário {requiresAddress ? "(obrigatório para NF-e)" : "(opcional)"}</summary><div className="fiscal-address-grid"><label>Logradouro<input value={buyer.street} onChange={event => onBuyerChange("street", event.target.value)} /></label><label>Número<input value={buyer.number} onChange={event => onBuyerChange("number", event.target.value)} /></label><label>Bairro<input value={buyer.neighborhood} onChange={event => onBuyerChange("neighborhood", event.target.value)} /></label><label>Cidade<input value={buyer.city} onChange={event => onBuyerChange("city", event.target.value)} /></label><label>Município IBGE<input inputMode="numeric" maxLength={7} value={buyer.ibge} onChange={event => onBuyerChange("ibge", event.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="7 dígitos" /></label><label>UF<input maxLength={2} value={buyer.uf} onChange={event => onBuyerChange("uf", event.target.value.toUpperCase().slice(0, 2))} /></label><label>CEP<input inputMode="numeric" maxLength={9} value={buyer.cep} onChange={event => onBuyerChange("cep", event.target.value.replace(/\D/g, "").slice(0, 8))} /></label></div></details>
    <div className="fiscal-issue-footer"><span className="proto-caption">Ambiente: {status?.environment === "production" ? "Produção" : "Homologação"}</span><div className="proto-toolbar"><button type="button" className="proto-subtle" onClick={onClose} disabled={issuing}>Cancelar</button><button type="button" onClick={onIssue} disabled={!canIssue || issuing}>{issuing ? <><LoaderCircle size={15} className="fiscal-spin" />Enviando…</> : <><Send size={15} />Enviar para Notaas</>}</button></div></div>
  </section></div>;
}
