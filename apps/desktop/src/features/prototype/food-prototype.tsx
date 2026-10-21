import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { Boxes, ChefHat, Check, CircleAlert, GripVertical, LoaderCircle, Plus, Scale, ShoppingBag, SlidersHorizontal, Tags, Trash2, Wheat } from "lucide-react";
import { Badge, Editor, Metrics, NotificationList, OfflinePreview, Panel, Preferences, Records, Tabs, type NotificationEntry } from "@/components/shared/prototype-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ui-states";
import { FoodAutomationPanel } from "@/features/automation/food-automation-panel";
import { FoodServicePanel } from "@/features/service/food-service-panel";
import { CustomersPage } from "@/features/customers/customers-page";
import { ProductStock } from "./product-stock";
import { CreditPage } from "@/features/credit/credit-page";
import { FinancePage } from "@/features/finance/finance-page";
import { createFoodProduct, registerCounterSale, getFoodOrders, getFoodProducts, updateFoodOrderStatus, updateFoodProduct, type FoodOrder, type FoodProduct, type FoodProductVariant, type ProductInput, type SalePaymentMethod } from "@/lib/food-api";

export const foodModules = {
  pos: ["PDV", "Monte a venda, confira os itens e escolha o pagamento."],
  orders: ["Pedidos", "Do recebimento à entrega, acompanhe cada etapa da operação."],
  service: ["Atendimento", "Conversas, carrinho e acompanhamento do WhatsApp."],
  credit: ["Crediário", "Consulte saldos e registre recebimentos."],
  products: ["Produtos", "Um catálogo para o balcão, o atendimento e os pedidos."],
  inventory: ["Estoque e ingredientes", "Acompanhe quantidades, entradas e produção."],
  customers: ["Clientes", "Cadastre os contatos e os dados de entrega dos seus clientes."],
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
export function FoodPrototype({ module, notifications, onReadNotifications }: { module: FoodModule; notifications?: NotificationEntry[]; onReadNotifications?: () => void }) {
  return <div className="prototype"><header className="proto-heading"><Badge>Mosaico Food</Badge><h1>{foodModules[module][0]}</h1><p>{foodModules[module][1]}</p></header>
    {module === "pos" && <Catalog pos />}
    {module === "products" && <Catalog />}
    {module === "orders" && <Orders />}
    {module === "service" && <FoodServicePanel />}
    {module === "credit" && <CreditPage />}
    {module === "inventory" && <Inventory />}
    {module === "customers" && <CustomersPage />}
    {module === "finance" && <FinancePage />}
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
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod | null>(null);
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
    <div className="proto-toolbar"><label>Buscar no catálogo<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Produto, categoria ou alias…" /></label>{!pos && <button type="button" className={showForm ? "proto-subtle" : ""} aria-expanded={showForm} onClick={() => { setEditingProduct(null); setShowForm(current => !current); }}>{showForm ? "Fechar cadastro" : "Cadastrar produto"}</button>}</div>
    {!pos && showForm && <ProductForm key={editingProduct?.id ?? "new"} products={products} initial={editingProduct} saving={saving} onCancel={() => { setShowForm(false); setEditingProduct(null); }} onSubmit={(input) => void saveProduct(input)} />}
    {loading ? <p className="proto-empty">Carregando catálogo…</p> : (!showForm || pos) && <div className={pos ? "proto-two" : ""}><div className="proto-three">{filtered.map((product) => <article key={product.id} className="proto-product"><div className="proto-product-art" aria-hidden="true">{productIcon(product.category)}</div><small>{product.category}{!product.active ? " · inativo" : ""}</small><h3>{product.name}</h3>{product.productionMode !== "ingredient" && <strong>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Preço não informado"}</strong>}<Badge>{!product.active ? "Inativo" : product.stockQuantity > 0 ? `${product.stockQuantity} em estoque` : product.preparationCapacity > 0 && (product.fryToOrder || product.allowOnDemand) ? "Pode preparar" : "Indisponível"}</Badge>{product.stockQuantity === 0 && product.preparationCapacity > 0 && product.fryToOrder && <small>Sem unidades prontas · disponível para fritar na hora</small>}{product.variants.length > 0 && <small>Opções: {product.variants.map((variant) => variant.name).join(", ")}</small>}{product.fryToOrder && <small>Permite fritar/preparar na hora</small>}<small>{product.aliases.length ? `Também reconhece: ${product.aliases.join(", ")}` : "Sem alias cadastrado"}</small><button type="button" disabled={selling || (pos && product.salePriceCents <= 0)} onClick={() => { if (pos) setCart({ ...cart, [product.id]: (cart[product.id] ?? 0) + 1 }); else { setEditingProduct(product); setShowForm(true); } }}>{pos ? product.salePriceCents <= 0 ? "Definir preço para vender" : product.stockQuantity === 0 && product.fryToOrder ? "Adicionar para fritar" : "Adicionar à venda" : "Editar cadastro"}</button></article>)}</div>
      {!filtered.length && <p className="proto-empty">{pos ? "Nenhum produto disponível para venda no momento." : "Nenhum produto ativo encontrado. Cadastre o primeiro produto para o atendimento reconhecê-lo."}</p>}
      {pos && <Panel title="Venda de balcão" subtitle="Confirme os itens e registre a venda"><label>Cliente<select><option>Consumidor final</option></select></label><div className="proto-stack" style={{ marginTop: 16 }}>{selected.map((product) => <div className="proto-ticket" key={product.id}><strong>{product.name}</strong><div className="proto-toolbar"><button type="button" disabled={selling} aria-label={"Diminuir " + product.name} onClick={() => setCart({ ...cart, [product.id]: Math.max(0, cart[product.id] - 1) })}>−</button><span>{cart[product.id]}</span><button type="button" disabled={selling} aria-label={"Aumentar " + product.name} onClick={() => setCart({ ...cart, [product.id]: cart[product.id] + 1 })}>+</button><strong>{money(product.salePriceCents * cart[product.id])}</strong></div></div>)}</div>{!selected.length && <p className="proto-empty">Selecione os produtos ao lado.</p>}<dl className="proto-facts"><div><dt>Total</dt><dd>{money(total)}</dd></div></dl><label>Pagamento recebido<select disabled={selling} value={paymentMethod ?? ""} onChange={event => setPaymentMethod(event.target.value ? event.target.value as SalePaymentMethod : null)}><option value="">Pendente / não informado</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option></select></label><div className="proto-toolbar"><button type="button" disabled={selling || !selected.length} onClick={() => void finalizeSale()}>{selling ? "Registrando…" : "Confirmar venda"}</button></div></Panel>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}

function Inventory() {
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      setProducts(await getFoodProducts());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o estoque.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refresh = () => void loadProducts();
    void loadProducts(true);
    window.addEventListener("food-stock-changed", refresh);
    return () => window.removeEventListener("food-stock-changed", refresh);
  }, []);

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = products.filter(product => {
    const matchesKind = kind === "all" || (kind === "ingredients" ? product.productionMode === "ingredient" : product.productionMode !== "ingredient");
    const matchesSearch = `${product.name} ${product.category} ${product.aliases.join(" ")}`.toLocaleLowerCase("pt-BR").includes(query);
    return matchesKind && matchesSearch;
  });

  return <div className="proto-stack">
    <div className="proto-toolbar">
      <label>Buscar no estoque<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Produto, ingrediente ou categoria…" /></label>
      <label>Tipo<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">Todos</option><option value="products">Produtos</option><option value="ingredients">Insumos</option></select></label>
    </div>
    {loading && <LoadingState icon={LoaderCircle} title="Carregando estoque" description="Buscando os produtos e ingredientes da loja." />}
    {!loading && error && <div className="proto-stack"><ErrorState icon={CircleAlert} title="Não foi possível carregar o estoque" description={error} /><button type="button" onClick={() => void loadProducts(true)}>Tentar novamente</button></div>}
    {!loading && !error && products.length === 0 && <EmptyState icon={Boxes} title="Estoque vazio" description="Cadastre um produto ou ingrediente para começar a controlar as quantidades." />}
    {!loading && !error && products.length > 0 && filtered.length === 0 && <p className="proto-empty">Nenhum item corresponde à busca ou ao tipo selecionado.</p>}
    {!loading && !error && filtered.length > 0 && <div className="inventory-list" aria-label="Produtos e ingredientes em estoque">
      {filtered.map(product => <article className="inventory-row" key={product.id}>
        <div className="inventory-row-name">
          <div><h2>{product.name}</h2><small>{product.category} · {product.productionMode === "ingredient" ? "Insumo" : product.productionMode === "recipe" ? "Produção própria" : "Produto comprado"}</small></div>
          {!product.active && <Badge>Inativo</Badge>}
        </div>
        <dl className="inventory-quantities">
          {product.productionMode === "ingredient" ? <div><dt>Disponível</dt><dd>{product.stockQuantity} {product.stockUnit}</dd></div> : <>
            <div><dt>Prontos</dt><dd>{product.stockQuantity}</dd></div>
            <div><dt>Para finalizar</dt><dd>{product.unpreparedQuantity}</dd></div>
          </>}
          {product.productionMode === "ingredient" && (product.unitWeightGrams || product.unitVolumeMl) && <div className="inventory-unit-detail"><dt>Por unidade</dt><dd>{[product.unitWeightGrams && `${product.unitWeightGrams} g`, product.unitVolumeMl && `${product.unitVolumeMl} ml`].filter(Boolean).join(" · ")}</dd></div>}
        </dl>
        {product.active ? <ProductStock product={product} onSaved={loadProducts} /> : <p className="proto-caption">Ative o cadastro para movimentar o estoque.</p>}
      </article>)}
    </div>}
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
  const [unitWeightGrams, setUnitWeightGrams] = useState(String(initial?.unitWeightGrams ?? ""));
  const [unitVolumeMl, setUnitVolumeMl] = useState(String(initial?.unitVolumeMl ?? ""));
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
    const salePriceCents = price.trim() ? Math.round(Number(price.replace(",", ".")) * 100) : 0;
    const stockQuantity = Number(stock);
    if (!name.trim() || !category.trim() || !Number.isFinite(salePriceCents) || salePriceCents < 0 || !Number.isInteger(stockQuantity) || stockQuantity < 0) {
      setFormError("Informe nome, categoria e um preço válido se quiser cadastrá-lo agora.");
      return;
    }
    const parsedUnitWeightGrams = unitWeightGrams.trim() ? Number(unitWeightGrams) : null;
    const parsedUnitVolumeMl = unitVolumeMl.trim() ? Number(unitVolumeMl) : null;
    if (productionMode === "ingredient" && ((parsedUnitWeightGrams !== null && (!Number.isInteger(parsedUnitWeightGrams) || parsedUnitWeightGrams <= 0)) || (parsedUnitVolumeMl !== null && (!Number.isInteger(parsedUnitVolumeMl) || parsedUnitVolumeMl <= 0)))) {
      setFormError("Peso e volume por unidade devem ser números inteiros maiores que zero.");
      return;
    }
    if (productionMode === "recipe" && (recipe.some(row => !row.ingredientId || !Number.isInteger(row.quantity) || row.quantity <= 0) || new Set(recipe.map(row => row.ingredientId)).size !== recipe.length)) {
      setFormError("Corrija os ingredientes adicionados ou salve sem ingredientes para completar depois.");
      return;
    }
    onSubmit({
      productionMode,
      stockUnit: productionMode === "ingredient" ? stockUnit : "un",
      unitWeightGrams: productionMode === "ingredient" ? parsedUnitWeightGrams : null,
      unitVolumeMl: productionMode === "ingredient" ? parsedUnitVolumeMl : null,
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
  const selectProductionMode = (mode: FoodProduct["productionMode"]) => {
    setProductionMode(mode);
    if (!initial && (category === "Lanches" || category === "Insumos")) setCategory(mode === "ingredient" ? "Insumos" : "Lanches");
  };

  return <form className="product-form" onSubmit={submit}>
    <header className="product-form-heading"><div><h3>{initial ? "Editar produto" : "Cadastrar produto"}</h3><p>Preencha os dados principais. Estoque e produção são controlados na aba Estoque.</p></div></header>
    <fieldset className="product-mode-field" disabled={Boolean(initial)}>
      <legend>Tipo de cadastro</legend>
      <div className="product-mode-grid">
        <button type="button" aria-pressed={productionMode === "ingredient"} className={productionMode === "ingredient" ? "is-selected" : ""} onClick={() => selectProductionMode("ingredient")}><span className="product-mode-title"><Wheat size={18} aria-hidden="true" /><strong>Insumo</strong>{productionMode === "ingredient" && <Check size={16} aria-hidden="true" />}</span><small>Usado em receitas, como farinha e presunto.</small></button>
        <button type="button" aria-pressed={productionMode === "resale"} className={productionMode === "resale" ? "is-selected" : ""} onClick={() => selectProductionMode("resale")}><span className="product-mode-title"><ShoppingBag size={18} aria-hidden="true" /><strong>Produto comprado</strong>{productionMode === "resale" && <Check size={16} aria-hidden="true" />}</span><small>Comprado pronto ou recebido para finalizar.</small></button>
        <button type="button" aria-pressed={productionMode === "recipe"} className={productionMode === "recipe" ? "is-selected" : ""} onClick={() => selectProductionMode("recipe")}><span className="product-mode-title"><ChefHat size={18} aria-hidden="true" /><strong>Feito na loja</strong>{productionMode === "recipe" && <Check size={16} aria-hidden="true" />}</span><small>Produzido aqui a partir de insumos.</small></button>
      </div>
    </fieldset>
    <section className="product-form-section">
      <h4><Tags size={16} aria-hidden="true" />Dados do item</h4>
      <div className={`product-form-fields${productionMode === "ingredient" ? " is-ingredient" : ""}`}>
        <label>Nome<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Coxinha" /></label>
        <label>Categoria<input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Salgados" /></label>
        {productionMode !== "ingredient" && <label>Preço de venda (R$)<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Opcional" /><small>Se deixar em branco, o atendimento perguntará o preço ao registrar a venda.</small></label>}
      </div>
    </section>
    {productionMode === "ingredient" && <section className="product-form-section ingredient-measurement-field">
      <h4><Scale size={16} aria-hidden="true" />Unidade de controle</h4>
      <p>Escolha como você registra a entrada desse insumo.</p>
      <div className="ingredient-measurement-grid">
        <label>Unidade<select disabled={Boolean(initial)} value={stockUnit} onChange={event => setStockUnit(event.target.value as FoodProduct["stockUnit"])}><option value="un">Unidades</option><option value="g">Gramas</option><option value="ml">Mililitros</option></select></label>
        <label>Peso por unidade (g)<input type="number" min="1" step="1" value={unitWeightGrams} onChange={event => setUnitWeightGrams(event.target.value)} placeholder="Opcional" /></label>
        <label>Volume por unidade (ml)<input type="number" min="1" step="1" value={unitVolumeMl} onChange={event => setUnitVolumeMl(event.target.value)} placeholder="Opcional" /></label>
      </div>
    </section>}
    {productionMode === "recipe" && <section className="product-form-section">
      <h4><ChefHat size={16} aria-hidden="true" />Ingredientes da receita <small>(opcional)</small></h4><p>Informe o que é usado em uma unidade do produto. Você pode completar a receita depois.</p>
      {recipe.map((row, index) => <div className="proto-variant-row" key={index}>
        <label>Ingrediente<select required value={row.ingredientId} onChange={event => setRecipe(current => current.map((entry, i) => i === index ? { ...entry, ingredientId: event.target.value } : entry))}><option value="">Escolha…</option>{ingredients.map(ingredient => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.stockQuantity} {ingredient.stockUnit})</option>)}</select></label>
        <label>Quantidade ({ingredients.find(ingredient => ingredient.id === row.ingredientId)?.stockUnit ?? "unidade do ingrediente"})<input required type="number" min="1" step="1" value={row.quantity || ""} onChange={event => setRecipe(current => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /></label>
        <button type="button" className="proto-subtle" onClick={() => setRecipe(current => current.filter((_, i) => i !== index))}>Remover</button>
      </div>)}
      <button type="button" disabled={!ingredients.length} onClick={() => setRecipe(current => [...current, { ingredientId: "", quantity: 0 }])}>Adicionar ingrediente</button>
      {!ingredients.length && <small>Nenhum insumo cadastrado ainda. Salve o produto sem ingredientes e anexe-os depois, ou diga ao assistente: “cadastre 200 gramas de presunto”.</small>}
    </section>}
    {productionMode !== "ingredient" && <details className="product-form-section product-form-advanced"><summary><span><SlidersHorizontal size={16} aria-hidden="true" />Opções e atendimento</span><small>Aliases, sabores e preparo</small></summary>
    <label className="product-aliases-field">Como o cliente também pode chamar este produto?<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="Ex.: coxinha, salgado" /><small className="text-muted">Separe os nomes por vírgula para o atendimento reconhecer mensagens informais.</small></label>
    <div className="proto-variants-field">
      <div className="proto-toolbar">
        <div><strong>Variações e sabores</strong><small className="block text-muted">Cadastre opções como tamanho, sabor ou recheio.</small></div>
        <button type="button" className="proto-subtle" onClick={() => { const id = crypto.randomUUID(); setVariants((current) => [...current, { id, name: "", aliases: [], priceDeltaCents: 0 }]); setVariantPrices((current) => ({ ...current, [id]: "" })); }}><Plus size={15} />Adicionar variação</button>
      </div>
      {variants.map((variant) => <div className="proto-variant-row" key={variant.id}>
        <label>Nome da variação<input required value={variant.name} onChange={(event) => updateVariant(variant.id, { name: event.target.value })} placeholder="Ex.: Presunto e queijo" /></label>
        <label>Aliases<input value={variant.aliases.join(", ")} onChange={(event) => updateVariant(variant.id, { aliases: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Ex.: misto, presunto queijo" /></label>
        <label>Adicional (R$)<input min="0" inputMode="decimal" value={variantPrices[variant.id] ?? ""} onChange={(event) => { const value = event.target.value; setVariantPrices((current) => ({ ...current, [variant.id]: value })); const cents = Math.round(Number(value.replace(",", ".")) * 100); updateVariant(variant.id, { priceDeltaCents: Number.isFinite(cents) && cents >= 0 ? cents : 0 }); }} placeholder="0,00" /></label>
        <button type="button" className="proto-subtle" aria-label={`Remover variação ${variant.name || "sem nome"}`} onClick={() => { setVariants((current) => current.filter((item) => item.id !== variant.id)); setVariantPrices((current) => { const next = { ...current }; delete next[variant.id]; return next; }); }}><Trash2 size={15} /></button>
      </div>)}
      {!variants.length && <p className="product-variants-empty">Sem variações cadastradas. O atendimento usará o nome do produto.</p>}
    </div>
    <p className="product-variants-note">As variações compartilham receita e estoque. Para sabores com ingredientes diferentes, cadastre produtos separados.</p>
    <div className="product-preparation-options">
      <label className="product-option-switch"><span><strong>Aceitar pedidos para preparar na hora</strong><small>Disponível quando houver itens para finalizar ou ingredientes suficientes.</small></span><input type="checkbox" checked={allowOnDemand} onChange={(event) => setAllowOnDemand(event.target.checked)} /></label>
      <label className="product-option-switch"><span><strong>Oferecer preparo na hora</strong><small>Permite oferecer fritura ou preparo mesmo quando já há unidades prontas.</small></span><input type="checkbox" checked={fryToOrder} onChange={(event) => setFryToOrder(event.target.checked)} /></label>
    </div>
    </details>}
    <div className="product-form-footer">
      <label className="product-active-switch"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Produto ativo</span></label>
      {formError && <p role="alert" className="proto-form-error">{formError}</p>}
      <div className="product-form-actions"><button type="submit" disabled={saving}>{saving ? "Salvando…" : initial ? "Salvar alterações" : "Salvar produto"}</button><button type="button" className="proto-subtle" onClick={onCancel}>Cancelar</button></div>
    </div>
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
function Fiscal() {
  const [tab, setTab] = useState("Documentos");
  return <><Metrics items={[["Ambiente", "Produção", "Comunicação fiscal"], ["Autorizados", "1", "Documentos autorizados"], ["Para revisão", "1", "Rejeição pendente"]]} /><Tabs items={["Documentos", "Revisão", "Configuração fiscal"]} value={tab} onChange={setTab} />{tab === "Configuração fiscal" ? <Editor title="Perfil fiscal da loja" tabs={["Estabelecimento", "Numeração", "Provedor", "Contingência"]} labels={["CNPJ", "UF", "Regime", "Série"]} /> : <Records key={tab} title={tab} action="Preparar rascunho" fields={["Documento", "Venda", "Situação", "Referência"]} rows={[{ id: "f1", name: "NFC-e 001", detail: "Venda #1042 · DANFE/XML", status: "Autorizado", value: "Documento fiscal" }, { id: "f2", name: "NFC-e 002", detail: "Venda #1043 · revisar perfil do produto", status: "Rejeitado", value: "Revisar cadastro" }]} />}</>;
}
