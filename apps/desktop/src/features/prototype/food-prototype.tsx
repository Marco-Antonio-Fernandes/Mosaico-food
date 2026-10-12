import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge, Editor, Metrics, NotificationList, OfflinePreview, Panel, Preferences, Records, Tabs, type NotificationEntry, type RecordItem } from "@/components/shared/prototype-kit";
import { FoodAutomationPanel } from "@/features/automation/food-automation-panel";
import { FoodServicePanel } from "@/features/service/food-service-panel";
import { ProductStock } from "./product-stock";
import { createFoodProduct, registerCounterSale, getFoodOrders, getFoodProducts, updateFoodOrderStatus, updateFoodProduct, type FoodOrder, type FoodProduct, type FoodProductVariant, type ProductInput } from "@/lib/food-api";

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
    {module === "inventory" && <Catalog />}
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
  const [selling, setSelling] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "cash" | "card" | null>(null);
  const [saleOperationId, setSaleOperationId] = useState(() => crypto.randomUUID());
  useEffect(() => { setSaleOperationId(crypto.randomUUID()); }, [cart, paymentMethod]);

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
    const refresh = () => void loadProducts();
    window.addEventListener("food-stock-changed", refresh);
    return () => window.removeEventListener("food-stock-changed", refresh);
  }, [pos]);

  const categories = ["Todos", ...new Set(products.map((product) => product.category))];
  const selected = products.filter((product) => cart[product.id]);
  const filtered = products.filter((product) => (!pos || (product.active && product.productionMode !== "ingredient" && product.stockQuantity > 0)) && (category === "Todos" || category === product.category) && `${product.name} ${product.aliases.join(" ")} ${product.variants.map((variant) => `${variant.name} ${variant.aliases.join(" ")}`).join(" ")}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const total = selected.reduce((sum, product) => sum + product.salePriceCents * cart[product.id], 0);
  async function finalizeSale() {
    if (selling || !selected.length) return;
    setSelling(true);
    try {
      const result = await registerCounterSale({ operationId: saleOperationId, paymentMethod, items: selected.map(product => ({ productId: product.id, quantity: cart[product.id], unitPriceCents: product.salePriceCents })) });
      setCart({}); setNotice(result.message); setError(""); await loadProducts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a venda."); }
    finally { setSelling(false); }
  }

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
    {!pos && showForm && <ProductForm key={editingProduct?.id ?? "new"} products={products} initial={editingProduct} saving={saving} onCancel={() => { setShowForm(false); setEditingProduct(null); }} onSubmit={(input) => void saveProduct(input)} />}
    {loading ? <p className="proto-empty">Carregando catálogo…</p> : <div className={pos ? "proto-two" : ""}><div className="proto-three">{filtered.map((product) => <article key={product.id} className="proto-product"><div className="proto-product-art" aria-hidden="true">{productIcon(product.category)}</div><small>{product.category}{!product.active ? " · inativo" : ""}</small><h3>{product.name}</h3>{product.productionMode !== "ingredient" && <strong>{money(product.salePriceCents)}</strong>}<Badge>{!product.active ? "Inativo" : product.stockQuantity > 0 ? `${product.stockQuantity} em estoque` : product.preparationCapacity > 0 && (product.fryToOrder || product.allowOnDemand) ? "Pode preparar" : "Indisponível"}</Badge>{product.stockQuantity === 0 && product.preparationCapacity > 0 && product.fryToOrder && <small>Sem unidades prontas · disponível para fritar na hora</small>}{product.variants.length > 0 && <small>Opções: {product.variants.map((variant) => variant.name).join(", ")}</small>}{product.fryToOrder && <small>Permite fritar/preparar na hora</small>}<small>{product.aliases.length ? `Também reconhece: ${product.aliases.join(", ")}` : "Sem alias cadastrado"}</small><button type="button" disabled={selling} onClick={() => { if (pos) setCart({ ...cart, [product.id]: (cart[product.id] ?? 0) + 1 }); else { setEditingProduct(product); setShowForm(true); } }}>{pos ? product.stockQuantity === 0 && product.fryToOrder ? "Adicionar para fritar" : "Adicionar à venda" : "Editar cadastro"}</button>{!pos && <ProductStock key={`${product.id}-${product.productionMode}`} product={product} onSaved={loadProducts} />}</article>)}</div>
      {!filtered.length && <p className="proto-empty">{pos ? "Nenhum produto disponível para venda no momento." : "Nenhum produto ativo encontrado. Cadastre o primeiro produto para o atendimento reconhecê-lo."}</p>}
      {pos && <Panel title="Venda de balcão" subtitle="Confirme os itens e registre a venda"><label>Cliente<select><option>Consumidor final</option></select></label><div className="proto-stack" style={{ marginTop: 16 }}>{selected.map((product) => <div className="proto-ticket" key={product.id}><strong>{product.name}</strong><div className="proto-toolbar"><button type="button" disabled={selling} aria-label={"Diminuir " + product.name} onClick={() => setCart({ ...cart, [product.id]: Math.max(0, cart[product.id] - 1) })}>−</button><span>{cart[product.id]}</span><button type="button" disabled={selling} aria-label={"Aumentar " + product.name} onClick={() => setCart({ ...cart, [product.id]: cart[product.id] + 1 })}>+</button><strong>{money(product.salePriceCents * cart[product.id])}</strong></div></div>)}</div>{!selected.length && <p className="proto-empty">Selecione os produtos ao lado.</p>}<dl className="proto-facts"><div><dt>Total</dt><dd>{money(total)}</dd></div></dl><label>Pagamento recebido<select disabled={selling} value={paymentMethod ?? ""} onChange={event => setPaymentMethod(event.target.value ? event.target.value as "pix" | "cash" | "card" : null)}><option value="">Pendente / não informado</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option></select></label><div className="proto-toolbar"><button type="button" disabled={selling || !selected.length} onClick={() => void finalizeSale()}>{selling ? "Registrando…" : "Confirmar venda"}</button></div></Panel>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}

type ProductFormProps = {
  products: FoodProduct[];
  initial: FoodProduct | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: ProductInput) => void;
};

function ProductForm({ initial, products, saving, onCancel, onSubmit }: ProductFormProps) {
  const [productionMode, setProductionMode] = useState<FoodProduct["productionMode"]>(initial?.productionMode ?? "resale");
  const [stockUnit, setStockUnit] = useState<FoodProduct["stockUnit"]>(initial?.stockUnit ?? "un");
  const [recipe, setRecipe] = useState<FoodProduct["recipe"]>(initial?.recipe ?? []);
  const ingredients = products.filter(product => product.productionMode === "ingredient" && product.active);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "Lanches");
  const [price, setPrice] = useState(initial ? String(initial.salePriceCents / 100).replace(".", ",") : "");
  const stock = String(initial?.stockQuantity ?? 0);
  const [aliases, setAliases] = useState(initial?.aliases.join(", ") ?? "");
  const [variants, setVariants] = useState<FoodProductVariant[]>(initial?.variants.map((variant) => ({ ...variant })) ?? []);
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>(() => Object.fromEntries((initial?.variants ?? []).map((variant) => [variant.id, (variant.priceDeltaCents / 100).toFixed(2).replace(".", ",")] )));
  const [allowOnDemand, setAllowOnDemand] = useState(initial?.allowOnDemand ?? false);
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
    if (productionMode === "recipe" && (!recipe.length || recipe.some(row => !row.ingredientId || !Number.isInteger(row.quantity) || row.quantity <= 0) || new Set(recipe.map(row => row.ingredientId)).size !== recipe.length)) {
      setFormError("Adicione os ingredientes usados em uma unidade, sem repetir ingredientes.");
      return;
    }
    onSubmit({
      productionMode,
      stockUnit: productionMode === "ingredient" ? stockUnit : "un",
      unpreparedQuantity: initial?.unpreparedQuantity ?? 0,
      recipe: productionMode === "recipe" ? recipe : [],
      name: name.trim(),
      category: category.trim(),
      aliases: aliases.split(",").map((item) => item.trim()).filter(Boolean),
      variants: variants
        .map((variant) => ({
          ...variant,
          name: variant.name.trim(),
          aliases: variant.aliases.map((alias) => alias.trim()).filter(Boolean),
        }))
        .filter((variant) => variant.name),
      salePriceCents,
      stockQuantity,
      allowOnDemand: productionMode !== "ingredient" && allowOnDemand,
      fryToOrder: productionMode !== "ingredient" && fryToOrder,
      active,
    });
  };

  const updateVariant = (id: string, changes: Partial<FoodProductVariant>) => {
    setVariants((current) => current.map((variant) => variant.id === id ? { ...variant, ...changes } : variant));
  };

  return <form className="proto-form" onSubmit={submit}>
    <h3>{initial ? "Editar produto" : "Cadastrar produto"}</h3>
    <label>Como você usa este item?<select value={productionMode} disabled={Boolean(initial)} onChange={event => setProductionMode(event.target.value as FoodProduct["productionMode"])}>
      <option value="resale">Compro para revender (pronto ou para finalizar)</option>
      <option value="recipe">Faço na loja com ingredientes</option>
      <option value="ingredient">Ingrediente para minhas receitas</option>
    </select></label>
    {productionMode === "ingredient" && <label>Unidade de controle<select disabled={Boolean(initial)} value={stockUnit} onChange={event => setStockUnit(event.target.value as FoodProduct["stockUnit"])}><option value="g">Gramas (g)</option><option value="ml">Mililitros (ml)</option><option value="un">Unidades</option></select><small>Ex.: presunto em gramas. Um pacote de 1 kg entra como 1.000 g.</small></label>}
    <label>Nome<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Coxinha" /></label>
    <label>Categoria<input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Salgados" /></label>
    {productionMode !== "ingredient" && <label>Preço de venda (R$)<input required inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0,00" /></label>}
    <small>Após salvar, use “Registrar estoque” para entradas ou “Registrar produção” para preparar unidades com desconto dos ingredientes.</small>
    {productionMode === "recipe" && <section className="proto-variants-field">
      <strong>Receita de 1 unidade</strong><small>Quanto você usa para fazer uma unidade? Ex.: uma esfirra usa 100 g de presunto. Para 10 esfirras, o sistema desconta 1.000 g.</small>
      {recipe.map((row, index) => <div className="proto-variant-row" key={index}>
        <label>Ingrediente<select required value={row.ingredientId} onChange={event => setRecipe(current => current.map((entry, i) => i === index ? { ...entry, ingredientId: event.target.value } : entry))}><option value="">Escolha…</option>{ingredients.map(ingredient => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.stockQuantity} {ingredient.stockUnit})</option>)}</select></label>
        <label>Quantidade ({ingredients.find(ingredient => ingredient.id === row.ingredientId)?.stockUnit ?? "unidade do ingrediente"})<input required type="number" min="1" step="1" value={row.quantity || ""} onChange={event => setRecipe(current => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /></label>
        <button type="button" className="proto-subtle" onClick={() => setRecipe(current => current.filter((_, i) => i !== index))}>Remover</button>
      </div>)}
      <button type="button" disabled={!ingredients.length} onClick={() => setRecipe(current => [...current, { ingredientId: "", quantity: 0 }])}>Adicionar ingrediente</button>
      {!ingredients.length && <small>Cadastre primeiro seus ingredientes usando a opção “Ingrediente para minhas receitas”.</small>}
    </section>}
    {productionMode !== "ingredient" && <details className="proto-variants-field"><summary>Sabores e atendimento pelo WhatsApp</summary>
    <label>Outros nomes do produto<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="Ex.: coxinha, salgado" /><small className="text-muted">Separe por vírgula. O atendimento usa esses nomes para entender mensagens informais.</small></label>
    <div className="proto-variants-field">
      <div className="proto-toolbar">
        <div><strong>Variações e sabores</strong><small className="block text-muted">Cadastre o nome e os jeitos que o cliente pode escrever cada opção.</small></div>
        <button type="button" className="proto-subtle" onClick={() => { const id = crypto.randomUUID(); setVariants((current) => [...current, { id, name: "", aliases: [], priceDeltaCents: 0 }]); setVariantPrices((current) => ({ ...current, [id]: "" })); }}><Plus size={15} />Adicionar variação</button>
      </div>
      {variants.map((variant) => <div className="proto-variant-row" key={variant.id}>
        <label>Nome da variação<input required value={variant.name} onChange={(event) => updateVariant(variant.id, { name: event.target.value })} placeholder="Ex.: Presunto e queijo" /></label>
        <label>Aliases<input value={variant.aliases.join(", ")} onChange={(event) => updateVariant(variant.id, { aliases: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Ex.: misto, presunto queijo" /></label>
        <label>Adicional (R$)<input min="0" inputMode="decimal" value={variantPrices[variant.id] ?? ""} onChange={(event) => { const value = event.target.value; setVariantPrices((current) => ({ ...current, [variant.id]: value })); const cents = Math.round(Number(value.replace(",", ".")) * 100); updateVariant(variant.id, { priceDeltaCents: Number.isFinite(cents) && cents >= 0 ? cents : 0 }); }} placeholder="0,00" /></label>
        <button type="button" className="proto-subtle" aria-label={`Remover variação ${variant.name || "sem nome"}`} onClick={() => { setVariants((current) => current.filter((item) => item.id !== variant.id)); setVariantPrices((current) => { const next = { ...current }; delete next[variant.id]; return next; }); }}><Trash2 size={15} /></button>
      </div>)}
      {!variants.length && <small className="text-muted">Sem variações: o atendimento usará apenas o nome e os aliases do produto.</small>}
    </div>
    <small>Variações compartilham esta receita e este estoque. Se os sabores usam ingredientes diferentes, cadastre um produto para cada sabor.</small>
    <label className="proto-switch"><span>Aceitar pedidos para preparar na hora</span><input type="checkbox" checked={allowOnDemand} onChange={(event) => setAllowOnDemand(event.target.checked)} /><small className="text-muted">Somente enquanto houver unidades para finalizar ou ingredientes suficientes.</small></label>
    <label className="proto-switch"><span>Oferecer fritura na hora</span><input type="checkbox" checked={fryToOrder} onChange={(event) => setFryToOrder(event.target.checked)} /><small className="text-muted">Oferece mesmo com unidades prontas, desde que haja estoque para fritar.</small></label>
    </details>}
    <label className="proto-switch"><span>Produto ativo</span><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></label>
    {formError && <p role="alert" className="text-sm text-red-200">{formError}</p>}
    <div className="proto-toolbar"><button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar produto"}</button><button type="button" className="proto-subtle" onClick={onCancel}>Cancelar</button></div>
  </form>;
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
      const result = await updateFoodOrderStatus(orderId, statusForStage(stage));
      const notificationMessage = result.notification?.sent
        ? " Cliente notificado pelo WhatsApp."
        : result.notification && !result.notification.skipped
          ? " A etapa mudou, mas não foi possível enviar a notificação."
          : "";
      setStatusMessage(`Pedido #${orderId.slice(0, 8)} movido para ${stages[stage]}.${notificationMessage}`);
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
