import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { GripVertical } from "lucide-react";
import { Badge, Editor, Metrics, NotificationList, OfflinePreview, Panel, Preferences, Records, Tabs, type NotificationEntry, type RecordItem } from "@/components/shared/prototype-kit";
import { FoodAutomationPanel } from "@/features/automation/food-automation-panel";
import { FoodServicePanel } from "@/features/service/food-service-panel";
import { createFoodProduct, getFoodOrders, getFoodProducts, updateFoodOrderStatus, updateFoodProduct, type FoodOrder, type FoodProduct, type ProductInput } from "@/lib/food-api";

export const foodModules = {
  pos: ["PDV", "Monte a venda, confira os itens e escolha o pagamento."],
  orders: ["Pedidos", "Do recebimento à entrega, acompanhe cada etapa da operação."],
  service: ["Atendimento", "Conversas, carrinho e acompanhamento do WhatsApp."],
  products: ["Produtos", "Um catálogo para o balcão, o atendimento e os pedidos."],
  inventory: ["Estoque e ingredientes", "Entradas, perdas, receitas e disponibilidade."],
  customers: ["Clientes e crediário", "Relacionamento, histórico e valores em aberto."],
  finance: ["Caixa e financeiro", "Abertura, recebimentos, despesas e fechamento."],
  fiscal: ["Fiscal", "Documentos, revisão de rejeições e histórico por venda."],
  notifications: ["Notificações", "Pedidos, atendimento e alertas que precisam de atenção."],
  automation: ["Automação", "Horários, boas-vindas, confirmação e transferência para humano."],
  offline: ["Offline e sincronização", "Fila local e conflitos de crediário."],
  settings: ["Configurações", "Loja, equipe, permissões e preferências da operação."],
} as const;
export type FoodModule = keyof typeof foodModules;
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const productIcon = (category: string) => ({ Lanches: "🍔", Porções: "🍟", Bebidas: "🥤", Combos: "🍽️", Sobremesas: "🍰" }[category] ?? "🍴");
const clients: RecordItem[] = [
  { id: "c1", name: "Ana Oliveira", detail: "Retirada · contato autorizado", status: "Em dia", value: "R$ 0,00 em aberto" },
  { id: "c2", name: "Bruno Lima", detail: "Delivery · endereço cadastrado", status: "Crediário", value: "R$ 84,00 em aberto" },
  { id: "c3", name: "Carla Mendes", detail: "Balcão · limite R$ 200,00", status: "Crediário", value: "R$ 35,00 em aberto" },
];
const movements: RecordItem[] = [
  { id: "m1", name: "Venda #1042", detail: "Pix · balcão", status: "Recebido", value: "R$ 45,00" },
  { id: "m2", name: "Compra de ingredientes", detail: "Despesa · fornecedores", status: "Pago", value: "R$ 180,00" },
  { id: "m3", name: "Venda #1043", detail: "Crediário · Bruno Lima", status: "Pendente", value: "R$ 84,00" },
];
export function FoodPrototype({ module, notifications, onReadNotifications }: { module: FoodModule; notifications?: NotificationEntry[]; onReadNotifications?: () => void }) {
  return <div className="prototype"><header className="proto-heading"><Badge>Mosaico Food</Badge><h1>{foodModules[module][0]}</h1><p>{foodModules[module][1]}</p></header>
    {module === "pos" && <Catalog pos />}
    {module === "products" && <Catalog />}
    {module === "orders" && <Orders />}
    {module === "service" && <FoodServicePanel />}
    {module === "inventory" && <Inventory />}
    {module === "customers" && <Customers />}
    {module === "finance" && <Finance />}
    {module === "fiscal" && <Fiscal />}
    {module === "notifications" && <NotificationList notifications={notifications} onReadAll={onReadNotifications} />}
    {module === "offline" && <OfflinePreview />}
    {module === "automation" && <FoodAutomationPanel />}
    {module === "settings" && <div className="proto-stack"><Editor title="Identidade da loja" tabs={["Dados da loja", "Entrega", "Impressão"]} labels={["Nome da loja", "Endereço", "Telefone público"]} /><Preferences groups={[{ title: "Equipe e acesso", labels: ["Operador de caixa", "Gerente", "Responsável fiscal"] }, { title: "Notificações", labels: ["Som de novo pedido", "Aviso de WhatsApp", "Alertas de estoque"] }]} /><Panel title="Integrações"><dl className="proto-facts"><div><dt>WhatsApp Cloud API</dt><dd>Não conectado</dd></div><div><dt>Fiscal</dt><dd>Configuração pendente</dd></div></dl></Panel></div>}
  </div>;
}
function Catalog({ pos = false }: { pos?: boolean }) {
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingProduct, setEditingProduct] = useState<FoodProduct | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadProducts = async () => {
    try {
      setProducts(await getFoodProducts({ activeOnly: pos, availableOnly: pos }));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o catálogo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, [pos]);

  const categories = ["Todos", ...new Set(products.map((product) => product.category))];
  const selected = products.filter((product) => cart[product.id]);
  const filtered = products.filter((product) => (!pos || (product.active && (product.stockQuantity > 0 || product.allowOnDemand || product.fryToOrder))) && (category === "Todos" || category === product.category) && `${product.name} ${product.aliases.join(" ")}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const total = selected.reduce((sum, product) => sum + product.salePriceCents * cart[product.id], 0);

  const saveProduct = async (input: ProductInput) => {
    setSaving(true);
    try {
      const product = editingProduct ? await updateFoodProduct(editingProduct.id, input) : await createFoodProduct(input);
      setProducts((current) => editingProduct ? current.map((item) => item.id === product.id ? product : item) : [product, ...current]);
      setShowForm(false);
      setEditingProduct(null);
      setNotice(editingProduct ? "Produto atualizado no catálogo." : "Produto cadastrado no catálogo.");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="proto-stack">
    <Tabs items={categories} value={category} onChange={setCategory} />
    <div className="proto-toolbar"><label>Buscar no catálogo<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Produto, categoria ou alias…" /></label>{!pos && <button type="button" onClick={() => { setEditingProduct(null); setShowForm((current) => !current); }}>Cadastrar produto</button>}</div>
    {!pos && showForm && <ProductForm initial={editingProduct} saving={saving} onCancel={() => { setShowForm(false); setEditingProduct(null); }} onSubmit={(input) => void saveProduct(input)} />}
    {loading ? <p className="proto-empty">Carregando catálogo…</p> : <div className={pos ? "proto-two" : ""}><div className="proto-three">{filtered.map((product) => <article key={product.id} className="proto-product"><div className="proto-product-art" aria-hidden="true">{productIcon(product.category)}</div><small>{product.category}{!product.active ? " · inativo" : ""}</small><h3>{product.name}</h3><strong>{money(product.salePriceCents)}</strong><Badge>{!product.active ? "Inativo" : product.stockQuantity > 0 ? `${product.stockQuantity} em estoque` : product.fryToOrder ? "Frita na hora" : product.allowOnDemand ? "Preparo sob demanda" : "Indisponível"}</Badge>{product.stockQuantity === 0 && product.fryToOrder && <small>Sem unidades prontas · disponível para fritar na hora</small>}{product.variants.length > 0 && <small>Opções: {product.variants.map((variant) => variant.name).join(", ")}</small>}{product.fryToOrder && <small>Permite fritar/preparar na hora</small>}<small>{product.aliases.length ? `Também reconhece: ${product.aliases.join(", ")}` : "Sem alias cadastrado"}</small><button type="button" onClick={() => { if (pos) setCart({ ...cart, [product.id]: (cart[product.id] ?? 0) + 1 }); else { setEditingProduct(product); setShowForm(true); } }}>{pos ? product.stockQuantity === 0 && product.fryToOrder ? "Adicionar para fritar" : "Adicionar à venda" : "Editar cadastro"}</button></article>)}</div>
      {!filtered.length && <p className="proto-empty">{pos ? "Nenhum produto disponível para venda no momento." : "Nenhum produto ativo encontrado. Cadastre o primeiro produto para o atendimento reconhecê-lo."}</p>}
      {pos && <Panel title="Venda de balcão" subtitle="Carrinho local do PDV"><label>Cliente<select><option>Consumidor final</option></select></label><div className="proto-stack" style={{ marginTop: 16 }}>{selected.map((product) => <div className="proto-ticket" key={product.id}><strong>{product.name}</strong><div className="proto-toolbar"><button type="button" aria-label={"Diminuir " + product.name} onClick={() => setCart({ ...cart, [product.id]: Math.max(0, cart[product.id] - 1) })}>−</button><span>{cart[product.id]}</span><button type="button" aria-label={"Aumentar " + product.name} onClick={() => setCart({ ...cart, [product.id]: cart[product.id] + 1 })}>+</button><strong>{money(product.salePriceCents * cart[product.id])}</strong></div></div>)}</div>{!selected.length && <p className="proto-empty">Selecione os produtos ao lado.</p>}<dl className="proto-facts"><div><dt>Total</dt><dd>{money(total)}</dd></div></dl><label>Pagamento<select><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Crediário</option></select></label><div className="proto-toolbar"><button type="button" disabled={!selected.length} onClick={() => { setNotice("Venda do PDV ainda precisa da rota de vendas; o carrinho usa o catálogo real."); setCart({}); }}>Finalizar venda</button></div></Panel>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}

type ProductFormProps = {
  initial: FoodProduct | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: ProductInput) => void;
};

function ProductForm({ initial, saving, onCancel, onSubmit }: ProductFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "Lanches");
  const [price, setPrice] = useState(initial ? String(initial.salePriceCents / 100).replace(".", ",") : "");
  const [stock, setStock] = useState(String(initial?.stockQuantity ?? 0));
  const [aliases, setAliases] = useState(initial?.aliases.join(", ") ?? "");
  const [variants, setVariants] = useState(initial?.variants.map((variant) => variant.name).join(", ") ?? "");
  const [allowOnDemand, setAllowOnDemand] = useState(initial?.allowOnDemand ?? true);
  const [fryToOrder, setFryToOrder] = useState(initial?.fryToOrder ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [formError, setFormError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const salePriceCents = Math.round(Number(price.replace(",", ".")) * 100);
    const stockQuantity = Number(stock);
    if (!name.trim() || !category.trim() || !Number.isFinite(salePriceCents) || salePriceCents < 0 || !Number.isInteger(stockQuantity) || stockQuantity < 0) {
      setFormError("Informe nome, categoria, preço válido e estoque inteiro maior ou igual a zero.");
      return;
    }
    const variantNames = variants.split(",").map((item) => item.trim()).filter(Boolean);
    onSubmit({
      name: name.trim(),
      category: category.trim(),
      aliases: aliases.split(",").map((item) => item.trim()).filter(Boolean),
      variants: variantNames.map((variantName) => {
        const existing = initial?.variants.find((variant) => variant.name.toLocaleLowerCase("pt-BR") === variantName.toLocaleLowerCase("pt-BR"));
        return { id: existing?.id ?? crypto.randomUUID(), name: variantName, aliases: [], priceDeltaCents: existing?.priceDeltaCents ?? 0 };
      }),
      salePriceCents,
      stockQuantity,
      allowOnDemand,
      fryToOrder,
      active,
    });
  };

  return <form className="proto-form" onSubmit={submit}><h3>{initial ? "Editar produto" : "Cadastrar produto"}</h3><label>Nome<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Coxinha" /></label><label>Categoria<input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Salgados" /></label><label>Preço base (R$)<input required inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0,00" /></label><label>Estoque pronto<input required type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} /></label><label>Variações / sabores<input value={variants} onChange={(event) => setVariants(event.target.value)} placeholder="Ex.: frango, carne" /><small className="text-muted">Se houver mais de uma opção, o WhatsApp pergunta antes de confirmar.</small></label><label>Aliases para o WhatsApp<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="Ex.: coxinha, salgado" /></label><label className="proto-switch"><span>Permitir preparo sob demanda</span><input type="checkbox" checked={allowOnDemand} onChange={(event) => setAllowOnDemand(event.target.checked)} /><small className="text-muted">Se ligado, o item pode continuar disponível para preparo quando o estoque pronto zerar.</small></label><label className="proto-switch"><span>Permitir fritar/preparar na hora</span><input type="checkbox" checked={fryToOrder} onChange={(event) => setFryToOrder(event.target.checked)} /><small className="text-muted">Se o estoque pronto acabar, o item continua disponível para fritar na hora.</small></label><label className="proto-switch"><span>Produto ativo</span><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></label>{formError && <p role="alert" className="text-sm text-red-200">{formError}</p>}<div className="proto-toolbar"><button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar produto"}</button><button type="button" className="proto-subtle" onClick={onCancel}>Cancelar</button></div></form>;
}
function Orders() {
  const stages = ["Recebido", "Em preparo", "Pronto", "Em trânsito", "Entregue"];
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("Carregando pedidos…");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrders = async () => {
    try {
      setOrders(await getFoodOrders());
      setError("");
      setStatusMessage("Segure um pedido e arraste-o para outra etapa.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os pedidos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
    const timer = window.setInterval(() => void loadOrders(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const stageForStatus = (status: string) => ({ confirmed: 0, preparing: 1, ready: 2, out_for_delivery: 3, delivered: 4 }[status] ?? 0);
  const statusForStage = (stage: number) => (["confirmed", "preparing", "ready", "out_for_delivery", "delivered"] as const)[stage];
  const orderItemsLabel = (order: FoodOrder) => order.items.map((item) => `${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}${item.fryNow ? " · frita na hora" : ""}`).join(" · ");
  const formatOrderTotal = (order: FoodOrder) => money(order.totalCents);

  async function moveOrder(orderId: string, stage: number) {
    const order = orders.find(item => item.id === orderId);
    if (!order || stageForStatus(order.status) === stage) return;

    const previousStatus = order.status;
    setOrders(current => current.map(item => item.id === orderId ? { ...item, status: statusForStage(stage) } : item));
    try {
      await updateFoodOrderStatus(orderId, statusForStage(stage));
      setStatusMessage(`Pedido #${orderId.slice(0, 8)} movido para ${stages[stage]}.`);
      setError("");
    } catch (moveError) {
      setOrders(current => current.map(item => item.id === orderId ? { ...item, status: previousStatus } : item));
      setError(moveError instanceof Error ? moveError.message : "Não foi possível atualizar a etapa do pedido.");
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, orderId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", orderId);
    setDraggedOrderId(orderId);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, stage: number) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain");
    if (orderId) moveOrder(orderId, stage);
    setDraggedOrderId(null);
    setDragOverStage(null);
  }

  if (loading) return <p className="proto-empty">Carregando pedidos…</p>;
  if (error && !orders.length) return <div className="proto-stack"><p role="alert" className="text-sm text-red-200">{error}</p><button type="button" onClick={() => { setLoading(true); void loadOrders(); }}>Tentar novamente</button></div>;
  return <><p className="sr-only" role="status">{statusMessage}</p>{error && <p role="alert" className="mb-4 text-sm text-red-200">{error}</p>}{!orders.length ? <Panel title="Pedidos"><p className="proto-empty">Nenhum pedido registrado ainda. Quando um cliente confirmar pelo WhatsApp, ele aparecerá aqui.</p></Panel> : <div className="proto-orders-board">{stages.map((stage, stageIndex) => { const stageOrders = orders.filter(order => stageForStatus(order.status) === stageIndex); return <Panel key={stage} title={stage} subtitle={stageOrders.length + " pedidos"}><div className={`order-dropzone${dragOverStage === stageIndex ? " is-drag-over" : ""}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stageIndex); }} onDragLeave={() => setDragOverStage(current => current === stageIndex ? null : current)} onDrop={event => handleDrop(event, stageIndex)}>{stageOrders.map(order => <article aria-label={`Pedido ${order.id}. Segure e arraste para mudar de etapa.`} className={`proto-ticket order-card${draggedOrderId === order.id ? " is-dragging" : ""}`} draggable onDragEnd={() => { setDraggedOrderId(null); setDragOverStage(null); }} onDragStart={event => handleDragStart(event, order.id)} key={order.id}><div className="order-card-grab"><GripVertical aria-hidden="true" size={18} />Segure e arraste</div><div><Badge>{order.source === "whatsapp" ? "WhatsApp" : order.source}</Badge><h3>#{order.id.slice(0, 8)}</h3></div><p>{orderItemsLabel(order)}</p><strong>{formatOrderTotal(order)}</strong><small>{order.fulfillment === "delivery" ? `Entrega · ${order.deliveryAddress || "endereço pendente"}` : "Retirada na loja"}</small></article>)}{!stageOrders.length && <div className="order-dropzone-empty"><span>Solte aqui</span><small>Arraste um pedido para esta etapa</small></div>}</div></Panel>; })}</div>}</>;
}
function Inventory() {
  const [tab, setTab] = useState("Posição atual");
  return <><Metrics items={[["Itens controlados", "18", "Itens cadastrados"], ["Abaixo do mínimo", "2", "Reposição sugerida"], ["Movimentações", "7", "Entradas e saídas do dia"]]} /><Tabs items={["Posição atual", "Movimentações", "Fichas técnicas"]} value={tab} onChange={setTab} />{tab === "Fichas técnicas" ? <Editor title="Receita do hambúrguer" tabs={["Ingredientes", "Rendimento", "Perdas"]} labels={["Produto vendido", "Rendimento", "Unidade"]} initialText="1 pão · 150 g de carne · 30 g de queijo." /> : <Records key={tab} title={tab} action="Nova movimentação" fields={["Item", "Unidade / origem", "Situação", "Quantidade"]} rows={tab === "Posição atual" ? [{ id: "i1", name: "Pão de hambúrguer", detail: "Unidade · mínimo 20", status: "Baixo", value: "12 un" }, { id: "i2", name: "Queijo", detail: "Quilograma · mínimo 2", status: "Regular", value: "5,2 kg" }, { id: "i3", name: "Refrigerante cola", detail: "Unidade · mínimo 12", status: "Regular", value: "36 un" }] : [{ id: "im1", name: "Entrada de queijo", detail: "Compra · fornecedor local", status: "Entrada", value: "+3 kg" }, { id: "im2", name: "Pão de hambúrguer", detail: "Venda #1043", status: "Saída", value: "−1 un" }]} />}</>;
}
function Customers() {
  const [tab, setTab] = useState("Clientes");
  return <><Metrics items={[["Clientes", "3", "Cadastros ativos"], ["Crediário em aberto", "R$ 119,00", "Saldo em aberto"], ["Sincronização", "Ativa", "Lançamentos atualizados"]]} /><Tabs items={["Clientes", "Crediário", "Histórico"]} value={tab} onChange={setTab} /><Records key={tab} title={tab} action={tab === "Clientes" ? "Novo cliente" : "Novo lançamento"} rows={tab === "Clientes" ? clients : [{ id: "cr1", name: "Bruno Lima", detail: "Débito · pedido #1043", status: "Em aberto", value: "R$ 84,00" }, { id: "cr2", name: "Carla Mendes", detail: "Débito · balcão", status: "Em aberto", value: "R$ 35,00" }, { id: "cr3", name: "Ana Oliveira", detail: "Pagamento · Pix", status: "Recebido", value: "R$ 28,00" }]} /></>;
}
function Finance() {
  const [tab, setTab] = useState("Movimentações");
  return <><Metrics items={[["Caixa do dia", "R$ 1.842", "Fechamento atual"], ["A receber", "R$ 119", "Crediário em aberto"], ["Despesas", "R$ 180", "Compras do período"]]} /><Tabs items={["Movimentações", "Abertura e fechamento", "Despesas", "Conciliação"]} value={tab} onChange={setTab} />{tab === "Abertura e fechamento" ? <Editor title="Conferência de caixa" tabs={["Abertura", "Sangria", "Fechamento"]} labels={["Operador", "Saldo inicial", "Dinheiro contado", "Cartão", "Pix"]} /> : <Records key={tab} title={tab} action="Novo lançamento" fields={["Descrição", "Origem / categoria", "Situação", "Valor"]} rows={movements} />}</>;
}
function Fiscal() {
  const [tab, setTab] = useState("Documentos");
  return <><Metrics items={[["Ambiente", "Produção", "Comunicação fiscal"], ["Autorizados", "1", "Documentos autorizados"], ["Para revisão", "1", "Rejeição pendente"]]} /><Tabs items={["Documentos", "Revisão", "Configuração fiscal"]} value={tab} onChange={setTab} />{tab === "Configuração fiscal" ? <Editor title="Perfil fiscal da loja" tabs={["Estabelecimento", "Numeração", "Provedor", "Contingência"]} labels={["CNPJ", "UF", "Regime", "Série"]} /> : <Records key={tab} title={tab} action="Preparar rascunho" fields={["Documento", "Venda", "Situação", "Referência"]} rows={[{ id: "f1", name: "NFC-e 001", detail: "Venda #1042 · DANFE/XML", status: "Autorizado", value: "Documento fiscal" }, { id: "f2", name: "NFC-e 002", detail: "Venda #1043 · revisar perfil do produto", status: "Rejeitado", value: "Revisar cadastro" }]} />}</>;
}
