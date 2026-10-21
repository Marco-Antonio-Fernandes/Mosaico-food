import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, MapPin, Pencil, Phone, Plus, RefreshCw, Save, Search, StickyNote, UserRound, UsersRound, X } from "lucide-react";
import { z } from "zod";
import { EmptyState, LoadingState } from "@/components/shared/ui-states";
import { foodApi } from "@/lib/food-api";

const customerSchema = z.object({
  id: z.string().uuid(), name: z.string(), phone: z.string(),
  email: z.string().nullable(), address: z.string().nullable(), notes: z.string().nullable(),
});
type Customer = z.infer<typeof customerSchema>;
const emptyForm = { name: "", phone: "", address: "", notes: "" };
type CustomerForm = typeof emptyForm;
const fieldLimits = { name: 160, phone: 15, address: 500, notes: 1000 };
const customerFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente com pelo menos dois caracteres.").max(fieldLimits.name, "O nome deve ter no máximo 160 caracteres."),
  phone: z.string().refine(value => /^[1-9]\d{9,10}$/.test(value.replace(/\D/g, "")), "Informe um telefone com DDD e 8 ou 9 dígitos."),
  address: z.string().trim().max(fieldLimits.address, "O endereço deve ter no máximo 500 caracteres."),
  notes: z.string().trim().max(fieldLimits.notes, "As observações devem ter no máximo 1000 caracteres."),
});
type Drawer = { mode: "create" } | { mode: "view" | "edit"; customer: Customer };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).filter((_, index, parts) => index === 0 || index === parts.length - 1).map(part => part[0]).join("").toLocaleUpperCase("pt-BR");
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = (digits.length === 12 || digits.length === 13) && digits.startsWith("55") ? digits.slice(2) : digits;
  const limited = local.slice(0, 11);
  if (limited.length <= 2) return limited ? `(${limited}` : "";
  const number = limited.slice(2);
  const prefixLength = number.length > 8 ? 5 : 4;
  return `(${limited.slice(0, 2)}) ${number.slice(0, prefixLength)}${number.length > prefixLength ? `-${number.slice(prefixLength)}` : ""}`;
}
function toForm(customer: Customer): CustomerForm {
  return { name: customer.name, phone: formatPhone(customer.phone), address: customer.address ?? "", notes: customer.notes ?? "" };
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [addressFilter, setAddressFilter] = useState("all");
  const [sort, setSort] = useState("asc");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const initialFormRef = useRef<CustomerForm>(emptyForm);
  const requestRef = useRef(0);
  const isDrawerOpen = drawer !== null;

  async function load() {
    const requestId = ++requestRef.current;
    setRefreshing(true);
    try {
      const result = z.object({ customers: z.array(customerSchema) }).parse(await foodApi<unknown>("/api/v1/food/customers"));
      if (requestId === requestRef.current) { setCustomers(result.customers); setLoadError(""); }
    } catch (error) {
      if (requestId === requestRef.current) setLoadError(error instanceof z.ZodError ? "O servidor retornou um cadastro inválido." : error instanceof Error ? error.message : "Não foi possível carregar os clientes.");
    } finally {
      if (requestId === requestRef.current) { setLoading(false); setRefreshing(false); }
    }
  }
  useEffect(() => { void load(); return () => { ++requestRef.current; }; }, []);
  useEffect(() => { setPage(1); }, [search, addressFilter, sort]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isDrawerOpen || !dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close(); document.body.style.overflow = previousOverflow;
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
      else searchRef.current?.focus();
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (formError) { formErrorRef.current?.scrollIntoView({ block: "nearest" }); formErrorRef.current?.focus(); }
  }, [formError]);
  useEffect(() => {
    if (confirmDiscard) { discardRef.current?.scrollIntoView({ block: "nearest" }); discardRef.current?.querySelector("button")?.focus(); }
  }, [confirmDiscard]);

  function open(mode: Drawer["mode"], customer?: Customer) {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const nextForm = customer ? toForm(customer) : { ...emptyForm };
    setForm(nextForm); initialFormRef.current = nextForm;
    setFormError(""); setConfirmDiscard(false); setNotice("");
    setDrawer(customer && mode !== "create" ? { mode, customer } : { mode: "create" });
  }
  function close() {
    if (saving) return;
    if (drawer?.mode !== "view" && JSON.stringify(form) !== JSON.stringify(initialFormRef.current)) setConfirmDiscard(true);
    else setDrawer(null);
  }
  function change(key: keyof CustomerForm, value: string) {
    setForm(current => ({ ...current, [key]: key === "phone" ? formatPhone(value) : value.slice(0, fieldLimits[key]) })); setFormError(""); setConfirmDiscard(false);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !drawer || drawer.mode === "view") return;
    const parsed = customerFormSchema.safeParse(form);
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? "Confira os dados do cliente."); return; }
    setSaving(true); setFormError(""); setConfirmDiscard(false);
    try {
      const result = z.object({ customer: customerSchema }).parse(await foodApi<unknown>(
        `/api/v1/food/customers${drawer.mode === "edit" ? `/${drawer.customer.id}` : ""}`,
        { method: drawer.mode === "edit" ? "PATCH" : "POST", body: JSON.stringify(parsed.data) },
      ));
      ++requestRef.current; setRefreshing(false);
      setCustomers(current => [...current.filter(customer => customer.id !== result.customer.id), result.customer]);
      setDrawer(null); setNotice(drawer.mode === "edit" ? `Cadastro de ${result.customer.name} atualizado.` : `${result.customer.name} cadastrado com sucesso.`);
    } catch (error) {
      setFormError(error instanceof z.ZodError ? "O servidor retornou um cadastro inválido. Atualize a lista antes de tentar novamente." : error instanceof Error ? error.message : "Não foi possível salvar o cliente.");
    } finally { setSaving(false); }
  }

  const query = normalize(search);
  const digits = query.replace(/\D/g, "");
  const withAddress = customers.filter(customer => Boolean(customer.address?.trim())).length;
  const filtered = customers.filter(customer => (addressFilter === "all" || (addressFilter === "with" ? Boolean(customer.address?.trim()) : !customer.address?.trim()))
    && (normalize(`${customer.name} ${customer.phone} ${customer.address ?? ""}`).includes(query)
      || (digits.length > 0 && !/[a-z]/i.test(query) && customer.phone.replace(/\D/g, "").includes(digits))))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") * (sort === "asc" ? 1 : -1));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const hasFilters = Boolean(search || addressFilter !== "all");
  function clearFilters() { setSearch(""); setAddressFilter("all"); searchRef.current?.focus(); }

  return <div className="customers-page">
    <div className="customers-summary">
      <div><span className="customer-summary-icon"><UsersRound size={22} aria-hidden="true" /></span><div><strong>{loading ? "—" : customers.length}</strong><span>Clientes cadastrados</span></div></div>
      <div><span className="customer-summary-icon is-green"><MapPin size={21} aria-hidden="true" /></span><div><strong>{loading ? "—" : withAddress}</strong><span>Com endereço de entrega</span></div></div>
      <button type="button" className="customer-create" onClick={() => open("create")}><Plus size={19} aria-hidden="true" />Novo cliente</button>
    </div>

    <section className="customers-directory" aria-label="Lista de clientes">
      <div className="customers-toolbar">
        <label className="customer-search"><span>Buscar cliente</span><div><Search size={18} aria-hidden="true" /><input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, telefone ou endereço" /></div></label>
        <label className="customer-sort">Ordenar por<select value={sort} onChange={event => setSort(event.target.value)}><option value="asc">Nome: A a Z</option><option value="desc">Nome: Z a A</option></select></label>
        <button type="button" className="proto-subtle customer-refresh" disabled={refreshing} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" className={refreshing ? "animate-spin" : ""} /><span>{refreshing ? "Atualizando…" : "Atualizar"}</span></button>
      </div>
      <div className="customers-filter-bar">
        <div className="customers-filters" role="group" aria-label="Filtrar por endereço de entrega">{[["all", "Todos", customers.length], ["with", "Com endereço", withAddress], ["without", "Sem endereço", customers.length - withAddress]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={addressFilter === value} onClick={() => setAddressFilter(String(value))}>{label}<span>{count}</span></button>)}</div>
        {hasFilters && <button type="button" className="customer-clear" onClick={clearFilters}><X size={14} aria-hidden="true" />Limpar filtros</button>}
      </div>
      {notice && <p role="status" className="customer-feedback is-success"><CheckCircle2 size={18} aria-hidden="true" />{notice}</p>}
      {loadError && <div className="customer-feedback is-error" role="alert"><p>{loadError}{customers.length > 0 && " Exibindo a última lista carregada."}</p><button type="button" className="proto-subtle" disabled={refreshing} onClick={() => void load()}>Tentar novamente</button></div>}
      {loading ? <LoadingState title="Carregando clientes" description="Buscando os contatos da sua loja." icon={UsersRound} />
        : !loadError && !customers.length ? <div className="customers-empty"><EmptyState title="Seu primeiro cliente começa aqui" description="Cadastre nome e telefone para facilitar o atendimento. Você pode incluir os dados de entrega depois." icon={UserRound} /><button type="button" onClick={() => open("create")}><Plus size={17} aria-hidden="true" />Cadastrar primeiro cliente</button></div>
        : !loadError && !filtered.length ? <div className="customers-empty"><EmptyState title="Nenhum cliente encontrado" description="Tente outro nome ou telefone, ou remova o filtro de endereço." icon={Search} /><button type="button" className="proto-subtle" onClick={clearFilters}>Limpar filtros</button></div>
        : filtered.length > 0 && <>
          <div className="customers-table-wrap"><table className="customers-table"><thead><tr><th>Cliente</th><th>Contato</th><th>Endereço de entrega</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
            {visible.map(customer => <tr key={customer.id}>
              <td><div className="customer-identity"><span className="customer-avatar" aria-hidden="true">{initials(customer.name)}</span><div><strong>{customer.name}</strong>{customer.notes && <span className="customer-note-label"><StickyNote size={12} aria-hidden="true" />Observações no cadastro</span>}</div></div></td>
              <td><div className="customer-contact"><span><Phone size={13} aria-hidden="true" />{formatPhone(customer.phone)}</span></div></td>
              <td><div className={`customer-address${customer.address ? "" : " is-missing"}`}><MapPin size={15} aria-hidden="true" /><span>{customer.address || "Endereço não cadastrado"}</span></div></td>
              <td><div className="customer-row-actions"><button type="button" className="proto-subtle customer-icon-button" aria-label={`Ver cadastro de ${customer.name}`} onClick={() => open("view", customer)}><Eye size={17} aria-hidden="true" /></button><button type="button" className="proto-subtle" aria-label={`Editar ${customer.name}`} onClick={() => open("edit", customer)}><Pencil size={14} aria-hidden="true" />Editar</button></div></td>
            </tr>)}
          </tbody></table></div>
          <div className="customers-pagination"><p aria-live="polite">{(currentPage - 1) * 10 + 1}–{Math.min(currentPage * 10, filtered.length)} de <strong>{filtered.length}</strong> {filtered.length === 1 ? "cliente" : "clientes"}</p><div><button type="button" className="proto-subtle customer-icon-button" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} aria-hidden="true" /></button><span>Página {currentPage} de {totalPages}</span><button type="button" className="proto-subtle customer-icon-button" aria-label="Próxima página" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} aria-hidden="true" /></button></div></div>
        </>}
    </section>

    {drawer && <dialog ref={dialogRef} className="customer-dialog prototype" aria-labelledby="customer-drawer-title" onCancel={event => { event.preventDefault(); close(); }}>
      <header className="customer-drawer-header"><div><span className="customer-eyebrow">CLIENTES</span><h2 id="customer-drawer-title">{drawer.mode === "create" ? "Novo cliente" : drawer.mode === "edit" ? "Editar cliente" : "Cadastro do cliente"}</h2><p>{drawer.mode === "create" ? "Nome e telefone são suficientes para começar." : drawer.customer.name}</p></div><button type="button" className="proto-subtle customer-icon-button" disabled={saving} aria-label="Fechar cadastro" onClick={close}><X size={20} aria-hidden="true" /></button></header>
      {drawer.mode === "view" ? <>
        <div className="customer-drawer-body"><div className="customer-profile"><span className="customer-avatar" aria-hidden="true">{initials(drawer.customer.name)}</span><h3>{drawer.customer.name}</h3></div>
          <dl className="customer-details">{[["Telefone / WhatsApp", formatPhone(drawer.customer.phone)], ["Endereço de entrega", drawer.customer.address], ["Observações", drawer.customer.notes]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Não informado"}</dd></div>)}</dl>
        </div><footer className="customer-drawer-footer"><button type="button" className="proto-subtle" onClick={close}>Fechar</button><button type="button" onClick={() => setDrawer({ mode: "edit", customer: drawer.customer })}><Pencil size={16} aria-hidden="true" />Editar cadastro</button></footer>
      </> : <form className="customer-form" onSubmit={event => void save(event)}>
        <div className="customer-drawer-body"><fieldset disabled={saving}>
          <section className="customer-form-section"><div className="customer-section-heading"><span><UserRound size={17} aria-hidden="true" /></span><div><h3>Dados de contato</h3><p>Para identificar o cliente e falar sobre o pedido.</p></div></div>
            <label>Nome completo <span className="customer-required">Obrigatório</span><input autoFocus required minLength={2} maxLength={fieldLimits.name} autoComplete="name" value={form.name} onChange={event => change("name", event.target.value)} placeholder="Ex.: Maria Oliveira" /></label>
            <label>Telefone / WhatsApp <span className="customer-required">Obrigatório</span><input required type="tel" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={event => change("phone", event.target.value)} placeholder="(11) 99999-9999" aria-describedby="customer-phone-hint" /><small id="customer-phone-hint">Inclua o DDD e 8 ou 9 dígitos. Cada telefone pertence a um único cadastro.</small></label>
          </section>
          <section className="customer-form-section"><div className="customer-section-heading"><span><MapPin size={17} aria-hidden="true" /></span><div><h3>Entrega</h3><p>Preencha se o cliente costuma receber pedidos em casa.</p></div></div>
            <label>Endereço completo <span className="customer-optional">Opcional</span><textarea rows={3} maxLength={fieldLimits.address} autoComplete="street-address" value={form.address} onChange={event => change("address", event.target.value)} placeholder="Rua, número, complemento, bairro, cidade, UF e CEP" aria-describedby="customer-address-hint" /><small id="customer-address-hint">Inclua um ponto de referência para facilitar a entrega. Até 500 caracteres.</small></label>
          </section>
          <section className="customer-form-section"><div className="customer-section-heading"><span><StickyNote size={17} aria-hidden="true" /></span><div><h3>Observações</h3><p>Informações úteis para a equipe no atendimento.</p></div></div>
            <label>Anotações internas <span className="customer-optional">Opcional</span><textarea rows={3} maxLength={fieldLimits.notes} value={form.notes} onChange={event => change("notes", event.target.value)} placeholder="Ex.: usar o interfone 2 ao chegar" /><small>Estas anotações ficam no cadastro e não são enviadas ao cliente. Até 1000 caracteres.</small></label>
          </section>
        </fieldset>
        {formError && <p ref={formErrorRef} tabIndex={-1} role="alert" className="customer-feedback is-error">{formError}</p>}
        {confirmDiscard && <div ref={discardRef} role="alert" className="customer-discard"><strong>Descartar as alterações?</strong><p>Os dados que você alterou ainda não foram salvos.</p><div><button type="button" className="proto-subtle" onClick={() => setConfirmDiscard(false)}>Continuar editando</button><button type="button" onClick={() => setDrawer(null)}>Descartar alterações</button></div></div>}
        </div>
        <footer className="customer-drawer-footer"><button type="button" className="proto-subtle" disabled={saving} onClick={close}>Cancelar</button><button type="submit" disabled={saving}><Save size={16} aria-hidden="true" />{saving ? "Salvando…" : drawer.mode === "edit" ? "Salvar alterações" : "Cadastrar cliente"}</button></footer>
      </form>}
    </dialog>}
  </div>;
}
