import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge, Editor, Metrics, OfflinePreview, Panel, Preferences, Records, Tabs, type RecordItem } from "@/components/shared/prototype-kit";
import { FoodServicePanel } from "@/features/service/food-service-panel";
import { CustomersPage } from "@/features/customers/customers-page";
import { ProductStock } from "./product-stock";
import { CreditPage } from "@/features/credit/credit-page";
import { FoodBackupPanel } from "@/features/system/food-backup-panel";
import { closeFoodCash, createFoodProducts, finalizeFoodOrder, getCreditLedger, getFoodCashToday, getFoodOrders, getFoodProducts, openFoodCash, PRICE_ADJUSTMENT_REASONS, registerCounterSale, updateFoodOrderStatus, updateFoodProduct, type CreditCustomerRecord, type FoodCashSnapshot, type FoodOrder, type FoodProduct, type FoodProductVariant, type ProductInput, type SalePaymentMethod } from "@/lib/food-api";
import { CreditCustomerPicker } from "@/components/shared/credit-customer-picker";

export const foodModules = {
  pos: ["PDV", "Monte a venda, confira os itens e escolha o pagamento."],
  orders: ["Pedidos", "Do recebimento à entrega, acompanhe cada etapa da operação."],
  service: ["Atendimento", "Conversas, carrinho e acompanhamento do WhatsApp."],
  credit: ["Crediário", "Consulte saldos e registre recebimentos."],
  products: ["Produtos", "Um catálogo para o balcão, o atendimento e os pedidos."],
  inventory: ["Estoque e ingredientes", "Entradas, perdas, receitas e disponibilidade."],
  customers: ["Clientes", "Cadastre os contatos e os dados de entrega dos seus clientes."],
  finance: ["Caixa e financeiro", "Abertura, recebimentos, despesas e fechamento."],
  fiscal: ["Fiscal", "Documentos, revisão de rejeições e histórico por venda."],
  backup: ["Backup", "Backup automático, restauração e proteção dos dados da loja."],
  settings: ["Configurações", "Loja, equipe, permissões e preferências da operação."],
} as const;
export type FoodModule = keyof typeof foodModules;
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const productIcon = (category: string) => ({ Lanches: "🍔", Porções: "🍟", Bebidas: "🥤", Combos: "🍽️", Sobremesas: "🍰" }[category] ?? "🍴");
const normalizeCatalogLabel = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const splitCatalogValues = (value: string) => [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
const stockFlavorKey = (flavor: string) => normalizeCatalogLabel(flavor) || "__sem_sabor__";
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
export function FoodPrototype({ module }: { module: FoodModule }) {
  return <div className="prototype"><header className="proto-heading"><Badge>Mosaico Food</Badge><h1>{foodModules[module][0]}</h1><p>{foodModules[module][1]}</p></header>
    {module === "pos" && <Catalog pos />}
    {module === "products" && <Catalog />}
    {module === "orders" && <Orders />}
    {module === "service" && <FoodServicePanel />}
    {module === "credit" && <CreditPage />}
    {module === "inventory" && <Catalog />}
    {module === "customers" && <CustomersPage />}
    {module === "finance" && <Finance />}
    {module === "fiscal" && <Fiscal />}
    {module === "backup" && <div className="proto-stack"><FoodBackupPanel /><OfflinePreview /></div>}
    {module === "settings" && <div className="proto-stack"><Editor title="Identidade da loja" tabs={["Dados da loja", "Entrega", "Impressão"]} labels={["Nome da loja", "Endereço", "Telefone público"]} /><Preferences groups={[{ title: "Equipe e acesso", labels: ["Operador de caixa", "Gerente", "Responsável fiscal"] }, { title: "Notificações", labels: ["Som de novo pedido", "Aviso de WhatsApp", "Alertas de estoque"] }]} /><Panel title="Integrações"><dl className="proto-facts"><div><dt>WhatsApp Cloud API</dt><dd>Não conectado</dd></div><div><dt>Fiscal</dt><dd>Configuração pendente</dd></div></dl></Panel></div>}
  </div>;
}
function Catalog({ pos = false }: { pos?: boolean }) {
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [notice, setNotice] = useState("");
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingProduct, setEditingProduct] = useState<FoodProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selling, setSelling] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod | null>(null);
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomerRecord[]>([]);
  const [creditCustomerId, setCreditCustomerId] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);
  const [saleOperationId, setSaleOperationId] = useState(() => crypto.randomUUID());
  useEffect(() => { setSaleOperationId(crypto.randomUUID()); }, [cart, paymentMethod]);

  useEffect(() => {
    if (paymentMethod !== "crediario") {
      setCreditCustomerId("");
      return;
    }
    if (creditCustomers.length || creditLoading) return;
    setCreditLoading(true);
    void getCreditLedger().then(data => setCreditCustomers(data.customers.filter(customer => customer.creditAccount))).catch(loadError => setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os clientes do crediário.")).finally(() => setCreditLoading(false));
  }, [paymentMethod, creditCustomers.length, creditLoading]);

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

  const categories = ["Todos", ...new Set(products.map((product) => product.productName).filter(Boolean))];
  const selected = products.filter((product) => (cart[product.id]?.quantity ?? 0) > 0);
  const filtered = products.filter((product) => (!pos || (product.active && product.productionMode !== "ingredient" && (product.stockQuantity > 0 || product.unpreparedQuantity > 0 || (product.productionMode === "recipe" && product.allowOnDemand && product.saleCapacity > 0)))) && (category === "Todos" || category === product.productName) && `${product.name} ${product.productName} ${product.flavor ?? ""} ${product.familyName} ${product.aliases.join(" ")} ${product.variants.map((variant) => `${variant.name} ${variant.aliases.join(" ")}`).join(" ")}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const familyGroups = filtered.reduce<Record<string, FoodProduct[]>>((groups, product) => {
    if (product.productName) groups[product.productName] = [...(groups[product.productName] ?? []), product];
    return groups;
  }, {});
  const familyEntries = Object.values(familyGroups);
  const total = selected.reduce((sum, product) => sum + lineUnitPrice(product, cart[product.id]) * cart[product.id].quantity, 0);
  async function finalizeSale() {
    if (selling || !selected.length) return;
    if (paymentMethod === "crediario" && !creditCustomerId) {
      setError("Selecione o cliente do crediário antes de confirmar.");
      return;
    }
    setSelling(true);
    try {
      const result = await registerCounterSale({ operationId: saleOperationId, paymentMethod, creditCustomerId: paymentMethod === "crediario" ? creditCustomerId : null, items: selected.map(product => {
        const line = cart[product.id];
        const selectedQuantity = product.customization ? line.selectedQuantity : undefined;
        const removedQuantity = product.customization && selectedQuantity !== undefined ? Math.max(0, product.customization.baseQuantity - selectedQuantity) : 0;
        const additionalItems = line.addedItems;
        return {
          productId: product.id,
          quantity: line.quantity,
          unitPriceCents: lineUnitPrice(product, line),
          customization: { ...(selectedQuantity === undefined ? {} : { selectedQuantity }), removedQuantity, addedItems: additionalItems },
          adjustmentCents: line.adjustmentCents,
          adjustmentNote: line.adjustmentNote.trim() || null,
          isGift: line.isGift,
        };
      }) });
      setCart({}); setNotice(result.message); setError(""); await loadProducts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a venda."); }
    finally { setSelling(false); }
  }

  const saveProduct = async (inputs: ProductInput[]) => {
    setSaving(true);
    try {
      const createdProducts = editingProduct ? [await updateFoodProduct(editingProduct.id, inputs[0])] : await createFoodProducts(inputs);
      setProducts((current) => editingProduct
        ? current.map((item) => item.id === createdProducts[0].id ? createdProducts[0] : item)
        : [...createdProducts, ...current]);
      setShowForm(false);
      setEditingProduct(null);
      setNotice(editingProduct ? "Produto atualizado no catálogo." : `${createdProducts.length} produto${createdProducts.length === 1 ? "" : "s"} cadastrado${createdProducts.length === 1 ? "" : "s"} no catálogo, com estoque separado por sabor.`);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="proto-stack">
    <Tabs items={categories} value={category} onChange={setCategory} />
    <div className="proto-toolbar"><label>Buscar produto ou sabor<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: esfi… ou carne" /></label>{!pos && <button type="button" onClick={() => { setEditingProduct(null); setShowForm((current) => !current); }}>Cadastrar produto</button>}</div>
    {!pos && search.trim() && familyEntries.some((group) => group.length > 1) && <div className="food-family-summary"><strong>Sabores encontrados</strong>{familyEntries.filter(group => group.length > 1).map(group => <span key={group[0].productName}><b>{group[0].productName}</b>: {group.map(product => product.flavor || "sem sabor").join(", ")}</span>)}</div>}
    {!pos && showForm && <ProductForm key={editingProduct?.id ?? "new"} products={products} initial={editingProduct} saving={saving} onCancel={() => { setShowForm(false); setEditingProduct(null); }} onSubmit={(input) => void saveProduct(input)} />}
    {loading ? <p className="proto-empty">Carregando catálogo…</p> : <div className={pos ? "proto-two" : ""}><div className="proto-three">{pos ? familyEntries.map(group => <ProductFamilyTile key={group[0].productName} products={group} selling={selling} onAdd={product => setCart(current => ({ ...current, [product.id]: current[product.id] ? { ...current[product.id], quantity: current[product.id].quantity + 1 } : newCartLine(product) }))} />) : filtered.map(product => <ProductTile key={product.id} product={product} onEdit={() => { setEditingProduct(product); setShowForm(true); }} onStockSaved={loadProducts} />)}</div>
      {!filtered.length && <p className="proto-empty">{pos ? "Nenhum produto disponível para venda no momento." : "Nenhum produto ativo encontrado. Cadastre o primeiro produto para o atendimento reconhecê-lo."}</p>}
      {pos && <Panel title="Venda de balcão" subtitle="Ajuste adicionais, remoções ou brinde por item antes de confirmar.">
        <div className="proto-stack" style={{ marginTop: 16 }}>
          {selected.map((product) => {
            const line = cart[product.id];
            const selectedQuantity = product.customization ? line.selectedQuantity ?? product.customization.baseQuantity : 0;
            const removedQuantity = product.customization ? Math.max(0, product.customization.baseQuantity - selectedQuantity) : 0;
            return <div className="proto-ticket" key={product.id}>
              <strong>{product.productName}{product.flavor ? ` · ${product.flavor}` : ""}</strong>
              <div className="proto-toolbar">
                <button type="button" disabled={selling} aria-label={"Diminuir " + product.name} onClick={() => setCart(current => { const next = { ...current }; const updated = { ...next[product.id], quantity: next[product.id].quantity - 1 }; if (updated.quantity <= 0) delete next[product.id]; else next[product.id] = updated; return next; })}>−</button>
                <span>{line.quantity}</span>
                <button type="button" disabled={selling} aria-label={"Aumentar " + product.name} onClick={() => setCart(current => ({ ...current, [product.id]: { ...current[product.id], quantity: current[product.id].quantity + 1 } }))}>+</button>
                <strong>{money(lineUnitPrice(product, line) * line.quantity)}</strong>
              </div>
              {product.customization && <label>{product.customization.label} por unidade (base: {product.customization.baseQuantity} {product.customization.unit})
                <input type="number" min={product.customization.allowRemoval ? 0 : product.customization.baseQuantity} step="1" value={selectedQuantity} disabled={selling} onChange={event => setCart(current => ({ ...current, [product.id]: { ...current[product.id], selectedQuantity: Number(event.target.value) } }))} />
                <small>{selectedQuantity > product.customization.baseQuantity ? `${selectedQuantity - product.customization.baseQuantity} ${product.customization.unit} adicionais · +${money((selectedQuantity - product.customization.baseQuantity) * product.customization.additionalUnitPriceCents)} por unidade` : removedQuantity ? `${removedQuantity} ${product.customization.unit} removida(s); registre o motivo abaixo.` : "Quantidade padrão incluída."}</small>
              </label>}
              <label>Itens adicionais sem preço automático
                <input value={line.addedItems.join(", ")} disabled={selling} onChange={event => setCart(current => ({ ...current, [product.id]: { ...current[product.id], addedItems: event.target.value.split(",").map(item => item.trim()).filter(Boolean) } }))} placeholder="Ex.: queijo, molho" />
              </label>
              <div className="proto-form">
                <label>Ajuste de valor (R$)<input inputMode="decimal" value={(line.adjustmentCents / 100).toFixed(2).replace(".", ",")} disabled={selling} onChange={event => setCart(current => ({ ...current, [product.id]: { ...current[product.id], adjustmentCents: parseCents(event.target.value) } }))} placeholder="0,00 ou -1,00" /></label>
                {(line.adjustmentCents !== 0 || line.isGift || removedQuantity > 0 || selectedQuantity > (product.customization?.baseQuantity ?? 0) || line.addedItems.length > 0) && <label>Motivo da alteração<select required value={line.adjustmentNote} disabled={selling} onChange={event => setCart(current => ({ ...current, [product.id]: { ...current[product.id], adjustmentNote: event.target.value } }))}><option value="">Escolha uma opção…</option>{PRICE_ADJUSTMENT_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}
              </div>
              <label className="proto-switch"><span>Lançar como brinde (valor zero)</span><input type="checkbox" checked={line.isGift} disabled={selling} onChange={event => setCart(current => ({ ...current, [product.id]: { ...current[product.id], isGift: event.target.checked } }))} /></label>
            </div>;
          })}
        </div>
        {!selected.length && <p className="proto-empty">Selecione os produtos ao lado.</p>}
        <dl className="proto-facts"><div><dt>Total</dt><dd>{money(total)}</dd></div></dl>
        <label>Pagamento recebido<select disabled={selling} value={paymentMethod ?? ""} onChange={event => setPaymentMethod(event.target.value ? event.target.value as SalePaymentMethod : null)}><option value="">Pendente / não informado</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option></select></label>
        {paymentMethod === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerId} onChange={setCreditCustomerId} disabled={selling} loading={creditLoading} />}
        <div className="proto-toolbar"><button type="button" disabled={selling || !selected.length} onClick={() => void finalizeSale()}>{selling ? "Registrando…" : "Confirmar venda"}</button></div>
      </Panel>}
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
  onSubmit: (inputs: ProductInput[]) => void;
};

type CartLine = {
  quantity: number;
  selectedQuantity?: number;
  addedItems: string[];
  adjustmentCents: number;
  adjustmentNote: string;
  isGift: boolean;
};

function newCartLine(product: FoodProduct): CartLine {
  return {
    quantity: 1,
    ...(product.customization ? { selectedQuantity: product.customization.baseQuantity } : {}),
    addedItems: [],
    adjustmentCents: 0,
    adjustmentNote: "",
    isGift: false,
  };
}

function parseCents(value: string) {
  const normalized = value.replace(/[^0-9,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function lineUnitPrice(product: FoodProduct, line: CartLine) {
  if (line.isGift) return 0;
  const customization = product.customization;
  const selectedQuantity = customization ? line.selectedQuantity ?? customization.baseQuantity : 0;
  const additionalQuantity = customization ? Math.max(0, selectedQuantity - customization.baseQuantity) : 0;
  return Math.max(0, product.salePriceCents + additionalQuantity * (customization?.additionalUnitPriceCents ?? 0) + line.adjustmentCents);
}

function ProductTile({ product, onEdit, onStockSaved }: { product: FoodProduct; onEdit: () => void; onStockSaved: () => Promise<void> }) {
  return <article className="proto-product">
    <div className="proto-product-art" aria-hidden="true">{productIcon(product.category)}</div>
    <small>Produto · {product.productName}{!product.active ? " · inativo" : ""}</small>
    <h3>{product.productName}</h3>
    {product.flavor && <span className="food-family-label">Sabor: {product.flavor}</span>}
    {product.productionMode !== "ingredient" && <strong>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Preço não informado"}</strong>}
    <Badge>{!product.active ? "Inativo" : product.stockQuantity > 0 ? `${product.stockQuantity} em estoque` : product.productionMode === "recipe" && product.saleCapacity > 0 && product.allowOnDemand ? `${product.saleCapacity} calculadas pelos insumos` : product.preparationCapacity > 0 && product.allowOnDemand ? "Pode preparar" : "Indisponível"}</Badge>
    {product.customization && <small>{product.customization.label}: base de {product.customization.baseQuantity} {product.customization.unit}</small>}
    {product.stockQuantity === 0 && product.productionMode === "recipe" && product.saleCapacity > 0 && product.allowOnDemand && <small>Venda direta pelos insumos · a baixa será confirmada em Notificações</small>}
    {product.stockQuantity === 0 && product.preparationCapacity > 0 && product.allowOnDemand && <small>Sem unidades prontas · disponível para preparar</small>}
    {product.ingredientDependencies.some(dependency => !dependency.available) && <small className="food-stock-warning">Faltam insumos: {product.ingredientDependencies.filter(dependency => !dependency.available).map(dependency => dependency.name).join(", ")}</small>}
    {product.variants.length > 0 && <small>Opções antigas: {product.variants.map(variant => variant.name).join(", ")}</small>}
    {product.allowOnDemand && <small>Aceita preparo sob demanda</small>}
    <small>{product.aliases.length ? `Também reconhece: ${product.aliases.join(", ")}` : "Sem alias cadastrado"}</small>
    <button type="button" onClick={onEdit}>Editar cadastro</button>
    <ProductStock product={product} onSaved={onStockSaved} />
  </article>;
}

function ProductFamilyTile({ products, selling, onAdd }: { products: FoodProduct[]; selling: boolean; onAdd: (product: FoodProduct) => void }) {
  const family = products[0];
  const readyTotal = products.reduce((sum, product) => sum + product.stockQuantity, 0);
  const unpreparedTotal = products.reduce((sum, product) => sum + product.unpreparedQuantity, 0);
  return <article className="proto-product food-product-family-card">
    <div className="proto-product-art" aria-hidden="true">{productIcon(family.category)}</div>
    <small>Produto</small>
    <h3>{family.productName}</h3>
    <strong>{readyTotal} prontos · {unpreparedTotal} não preparados</strong>
    <small>Escolha o sabor para adicionar ao pedido.</small>
    <div className="food-flavor-options">
      {products.map(product => <div className="food-flavor-option" key={product.id}>
        <div><strong>{product.flavor || "Sem sabor"}</strong><small>{product.stockQuantity} prontos · {product.unpreparedQuantity} não preparados{product.preparationCapacity > product.unpreparedQuantity ? ` · pode preparar ${product.preparationCapacity}` : ""}</small></div>
        <div className="food-flavor-option-action"><span>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Sem preço"}</span><button type="button" disabled={selling || product.salePriceCents <= 0 || (product.stockQuantity <= 0 && !(product.productionMode === "recipe" && product.allowOnDemand && product.saleCapacity > 0))} onClick={() => onAdd(product)}>{product.salePriceCents <= 0 ? "Definir preço" : product.stockQuantity <= 0 && product.productionMode !== "recipe" ? "Preparar antes" : "Adicionar"}</button></div>
      </div>)}
    </div>
  </article>;
}

function ProductForm({ initial, products, saving, onCancel, onSubmit }: ProductFormProps) {
  const [productionMode, setProductionMode] = useState<FoodProduct["productionMode"]>(initial?.productionMode ?? "resale");
  const [recipe, setRecipe] = useState<FoodProduct["recipe"]>(initial?.recipe.map(row => ({ ...row })) ?? []);
  const ingredients = products.filter(product => product.productionMode === "ingredient" && product.active);
  const [productName, setProductName] = useState(initial?.productName || initial?.familyName || initial?.name || "");
  const [flavors, setFlavors] = useState(initial?.flavor ?? "");
  const [price, setPrice] = useState(initial ? String(initial.salePriceCents / 100).replace(".", ",") : "");
  const [initialStockByFlavor, setInitialStockByFlavor] = useState<Record<string, string>>(() => ({
    [stockFlavorKey(initial?.flavor ?? "")]: String(initial?.productionMode === "resale" ? initial?.unpreparedQuantity ?? 0 : initial?.stockQuantity ?? 0),
  }));
  const [aliases, setAliases] = useState(initial?.aliases.join(", ") ?? "");
  const [variants, setVariants] = useState<FoodProductVariant[]>(initial?.variants.map((variant) => ({ ...variant })) ?? []);
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>(() => Object.fromEntries((initial?.variants ?? []).map((variant) => [variant.id, (variant.priceDeltaCents / 100).toFixed(2).replace(".", ",")] )));
  const [allowOnDemand, setAllowOnDemand] = useState(initial?.allowOnDemand ?? initial?.productionMode === "recipe");
  const [active, setActive] = useState(initial?.active ?? true);
  const [formError, setFormError] = useState("");
  const normalizedProductName = normalizeCatalogLabel(productName);
  const flavorNames = splitCatalogValues(flavors);
  const flavorRows = flavorNames.length ? flavorNames : [""];
  const productNameOptions = [...new Set(products.filter(product => product.productionMode !== "ingredient").map(product => product.productName).filter(Boolean))];
  const productSuggestions = productName.trim()
    ? productNameOptions.filter(option => normalizeCatalogLabel(option).includes(normalizedProductName) && normalizeCatalogLabel(option) !== normalizedProductName).slice(0, 6)
    : [];
  const flavorSuggestions = normalizedProductName
    ? [...new Set(products.filter(product => product.productionMode !== "ingredient" && normalizeCatalogLabel(product.productName) === normalizedProductName && product.flavor).map(product => product.flavor as string))]
    : [];
  const relatedFlavors = products.filter(product => product.id !== initial?.id && product.productionMode !== "ingredient" && normalizeCatalogLabel(product.productName) === normalizedProductName && product.flavor);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const salePriceCents = price.trim() ? Math.round(Number(price.replace(",", ".")) * 100) : 0;
    if (!productName.trim() || !Number.isFinite(salePriceCents) || salePriceCents < 0) {
      setFormError("Informe o produto e um preço válido se quiser cadastrá-lo agora.");
      return;
    }
    if (productionMode === "recipe" && (recipe.some(row => !row.ingredientId || !Number.isInteger(row.quantity) || row.quantity <= 0) || new Set(recipe.map(row => row.ingredientId)).size !== recipe.length)) {
      setFormError("Corrija os insumos e informe o rendimento de cada um.");
      return;
    }
    const aliasesList = aliases.split(",").map((item) => item.trim()).filter(Boolean);
    const cleanedVariants = variants
      .map((variant) => ({
        ...variant,
        name: variant.name.trim(),
        aliases: variant.aliases.map((alias) => alias.trim()).filter(Boolean),
      }))
      .filter((variant) => variant.name);
    const rows = initial ? [initial.flavor ?? ""] : productionMode === "ingredient" ? [""] : flavorRows;
    const inputs = rows.map((rowFlavor) => {
      const initialQuantity = Number(initialStockByFlavor[stockFlavorKey(rowFlavor)] ?? 0);
      return {
        productionMode,
        stockUnit: "un" as const,
        unitWeightGrams: null,
        unitVolumeMl: null,
        unpreparedQuantity: initial ? initial.unpreparedQuantity : productionMode === "resale" ? initialQuantity : 0,
        recipe: productionMode === "recipe" ? recipe : [],
        name: [productName.trim(), rowFlavor].filter(Boolean).join(" · "),
        productName: productName.trim(),
        flavor: rowFlavor || null,
        category: "Geral",
        aliases: aliasesList,
        variants: cleanedVariants,
        salePriceCents,
        stockQuantity: initial ? initial.stockQuantity : productionMode === "ingredient" ? initialQuantity : 0,
        allowOnDemand: productionMode !== "ingredient" && allowOnDemand,
        fryToOrder: false,
        active,
        customization: initial?.customization ?? null,
      } satisfies ProductInput;
    });
    if (inputs.some(input => !Number.isInteger(input.unpreparedQuantity) || input.unpreparedQuantity < 0 || !Number.isInteger(input.stockQuantity) || input.stockQuantity < 0)) {
      setFormError("Informe quantidades inteiras e não negativas para cada sabor.");
      return;
    }
    onSubmit(inputs);
  };

  const updateVariant = (id: string, changes: Partial<FoodProductVariant>) => {
    setVariants((current) => current.map((variant) => variant.id === id ? { ...variant, ...changes } : variant));
  };
  const selectProductionMode = (mode: FoodProduct["productionMode"]) => {
    setProductionMode(mode);
  };

  return <form className="proto-form" onSubmit={submit}>
    <h3>{initial ? "Editar produto" : "Cadastrar produto"}</h3>
    <fieldset className="product-mode-field" disabled={Boolean(initial)}><legend>O que é este item?</legend><div className="product-mode-grid"><button type="button" className={productionMode === "ingredient" ? "is-selected" : ""} onClick={() => selectProductionMode("ingredient")}><strong>Insumo</strong><small>Uso para fazer outros produtos. Ex.: farinha, presunto ou óleo.</small></button><button type="button" className={productionMode === "resale" ? "is-selected" : ""} onClick={() => selectProductionMode("resale")}><strong>Produto comprado</strong><small>Recebo cru ou congelado e adiciono ao estoque para preparar.</small></button><button type="button" className={productionMode === "recipe" ? "is-selected" : ""} onClick={() => selectProductionMode("recipe")}><strong>Produto feito aqui</strong><small>Uso insumos, preparo e depois adiciono as unidades prontas.</small></button></div></fieldset>
    {productionMode === "ingredient" && <section className="proto-variants-field ingredient-measurement-field"><strong>Controle por unidade</strong><small>Cadastre como você conta no dia a dia: 1 pacote, 1 peça, 1 garrafa, 1 bandeja etc. Não precisa pesar nem informar ml ou mg.</small></section>}
    <div className="food-product-basic-fields">
      <label>Produto-base<input required list="food-product-names" value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Ex.: Esfirra ou Pão com mortadela" /><small>Digite algumas letras para reaproveitar um produto já cadastrado. Ex.: “enfi” encontra “Esfirra”.</small></label>
      <datalist id="food-product-names">{productNameOptions.map(option => <option key={option} value={option} />)}</datalist>
      <label>{initial ? "Sabor" : "Sabores (separados por vírgula)"}<input list="food-product-flavors" value={flavors} disabled={Boolean(initial)} onChange={(event) => setFlavors(event.target.value)} placeholder="Ex.: Carne, Presunto, Queijo" /><small>{initial ? "Cada sabor tem estoque próprio. Para adicionar outro sabor, cadastre-o no mesmo produto-base." : "Cadastre todos os sabores de uma vez. Cada sabor será um produto separado, com estoque próprio."}</small></label>
      <datalist id="food-product-flavors">{flavorSuggestions.map(option => <option key={option} value={option} />)}</datalist>
      <label>Preço de venda (R$) — opcional<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Deixe em branco para informar depois" /><small>Você pode preencher depois. Se vender sem preço cadastrado, o assistente perguntará o total.</small></label>
      {productSuggestions.length > 0 && <div className="food-product-suggestions" role="listbox" aria-label="Produtos encontrados">{productSuggestions.map(option => <button type="button" key={option} onClick={() => setProductName(option)}>{option}</button>)}</div>}
      {relatedFlavors.length > 0 && <div className="food-family-notice"><strong>Sabores já cadastrados para “{productName}”</strong><small>{relatedFlavors.map(product => product.flavor).filter(Boolean).join(", ")}</small></div>}
    </div>
    {productionMode === "ingredient" && <section className="proto-variants-field food-flavor-stock-field"><strong>Estoque inicial</strong><small>Informe quantas unidades deste insumo já existem.</small><label>Quantidade inicial<input type="number" min="0" step="1" value={initialStockByFlavor[stockFlavorKey("")] ?? "0"} disabled={Boolean(initial)} onChange={event => setInitialStockByFlavor(current => ({ ...current, [stockFlavorKey("")]: event.target.value }))} /></label></section>}
    {!initial && productionMode === "resale" && <section className="proto-variants-field food-flavor-stock-field"><strong>Estoque inicial por sabor</strong><small>Informe quantos produtos não preparados existem de cada sabor. Ex.: 10 carne, 12 presunto e 8 queijo.</small>{flavorRows.map(rowFlavor => <div className="food-flavor-stock-row" key={stockFlavorKey(rowFlavor)}><strong>{rowFlavor || "Produto sem sabor"}</strong><label>Produtos não preparados<input type="number" min="0" step="1" value={initialStockByFlavor[stockFlavorKey(rowFlavor)] ?? "0"} onChange={event => setInitialStockByFlavor(current => ({ ...current, [stockFlavorKey(rowFlavor)]: event.target.value }))} /></label></div>)}</section>}
    {initial && <small>O estoque pronto e o estoque não preparado são alterados pelo botão de estoque, por sabor.</small>}
    <small>Depois de salvar, use o botão de estoque no cartão para adicionar unidades para preparar ou registrar quantas já ficaram prontas.</small>
    {productionMode === "recipe" && <section className="proto-variants-field">
      <strong>Insumos e rendimento</strong><small>Informe aproximadamente quantos produtos você consegue fazer com 1 unidade de cada insumo. Ex.: 1 pacote de mortadela rende 20 pães.</small>
      {recipe.map((row, index) => <div className="proto-variant-row food-dependency-row" key={index}>
        <label>Insumo<select required value={row.ingredientId} onChange={event => setRecipe(current => current.map((entry, i) => i === index ? { ...entry, ingredientId: event.target.value } : entry))}><option value="">Escolha…</option>{ingredients.map(ingredient => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.stockQuantity} unidades)</option>)}</select></label>
        <label>Produtos por 1 unidade<input required type="number" min="1" step="1" value={row.quantity} onChange={event => setRecipe(current => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) || 0 } : entry))} placeholder="Ex.: 20" /><small>Rendimento aproximado</small></label>
        <button type="button" className="proto-subtle" onClick={() => setRecipe(current => current.filter((_, i) => i !== index))}>Remover</button>
      </div>)}
      <button type="button" disabled={!ingredients.length} onClick={() => setRecipe(current => [...current, { ingredientId: "", quantity: 1 }])}>Adicionar insumo</button>
      {!ingredients.length && <small>Nenhum insumo cadastrado ainda. Cadastre primeiro o presunto, mortadela, queijo, pão etc. como unidades.</small>}
    </section>}
    {productionMode !== "ingredient" && <details className="proto-variants-field"><summary>Aliases e atendimento</summary>
    <label>Outros nomes do produto<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="Ex.: coxinha, salgado" /><small className="text-muted">Separe por vírgula. O atendimento usa esses nomes para entender mensagens informais.</small></label>
    <div className="proto-variants-field">
      <div className="proto-toolbar">
        <div><strong>Opções antigas do cadastro</strong><small className="block text-muted">Use Produto-base e Sabor acima para novos cadastros. Estas opções são mantidas para compatibilidade com produtos antigos.</small></div>
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
    <small>Produtos com sabores diferentes têm cadastro, preço e estoque próprios. O sabor é opcional.</small>
    <label className="proto-switch"><span>Aceitar preparo sob demanda</span><input type="checkbox" checked={allowOnDemand} onChange={(event) => setAllowOnDemand(event.target.checked)} /><small className="text-muted">Permite preparar o item quando não houver unidade pronta, desde que haja estoque para isso.</small></label>
    </details>}
    <label className="proto-switch"><span>Produto ativo</span><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></label>
    {formError && <p role="alert" className="proto-form-error">{formError}</p>}
    <div className="proto-toolbar"><button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar produto"}</button><button type="button" className="proto-subtle" onClick={onCancel}>Cancelar</button></div>
  </form>;
}
function Orders() {
  const stages = ["Recebido", "Em preparo", "Pronto", "Em trânsito", "Finalizado"];
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);
  const [finalizingOrder, setFinalizingOrder] = useState<FoodOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod | "">("");
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomerRecord[]>([]);
  const [creditCustomerId, setCreditCustomerId] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
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

  useEffect(() => {
    if (paymentMethod !== "crediario" || !finalizingOrder) {
      if (paymentMethod !== "crediario") setCreditCustomerId("");
      return;
    }
    if (creditCustomers.length || creditLoading) return;
    setCreditLoading(true);
    void getCreditLedger().then(data => setCreditCustomers(data.customers.filter(customer => customer.creditAccount))).catch(loadError => setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os clientes do crediário.")).finally(() => setCreditLoading(false));
  }, [paymentMethod, finalizingOrder, creditCustomers.length, creditLoading]);

  const stageForStatus = (status: string) => ({ confirmed: 0, preparing: 1, ready: 2, out_for_delivery: 3, delivered: 4 }[status] ?? 0);
  const statusForStage = (stage: number) => (["confirmed", "preparing", "ready", "out_for_delivery", "delivered"] as const)[stage];
  const orderItemsLabel = (order: FoodOrder) => order.items.map((item) => `${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}${item.fryNow ? " · preparar" : ""}${item.isGift ? " · brinde" : ""}`).join(" · ");
  const formatOrderTotal = (order: FoodOrder) => money(order.totalCents);

  async function finalizeOrder() {
    if (!finalizingOrder || !paymentMethod || finalizing) return;
    if (paymentMethod === "crediario" && !creditCustomerId) {
      setError("Selecione o cliente do crediário antes de finalizar.");
      return;
    }
    setFinalizing(true);
    try {
      const result = await finalizeFoodOrder(finalizingOrder.id, paymentMethod, paymentMethod === "crediario" ? creditCustomerId : null);
      setOrders(current => current.map(item => item.id === finalizingOrder.id ? result.order : item));
      setStatusMessage(`Pedido #${finalizingOrder.id.slice(0, 8)} finalizado e venda registrada.`);
      setFinalizingOrder(null); setPaymentMethod(""); setCreditCustomerId(""); setError("");
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : "Não foi possível finalizar o pedido.");
    } finally {
      setFinalizing(false);
    }
  }

  async function moveOrder(orderId: string, stage: number) {
    const order = orders.find(item => item.id === orderId);
    if (!order || stageForStatus(order.status) === stage) return;
    if (stage === 4) {
      setFinalizingOrder(order);
      setPaymentMethod("");
      setCreditCustomerId("");
      return;
    }

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
  return <div className="proto-stack"><p className="sr-only" role="status">{statusMessage}</p>{error && <p role="alert" className="mb-4 text-sm text-red-200">{error}</p>}
    <div className="proto-toolbar"><div><strong>Pedidos em andamento</strong><small className="block text-muted">Os pedidos são criados pelo Assistente. Arraste cada pedido pela operação; a venda só é registrada ao finalizar.</small></div></div>
    {!orders.length ? <Panel title="Pedidos"><p className="proto-empty">Nenhum pedido registrado ainda. Crie um pedido no balcão ou aguarde um pedido do WhatsApp.</p></Panel> : <div className="proto-orders-board">{stages.map((stage, stageIndex) => { const stageOrders = orders.filter(order => stageForStatus(order.status) === stageIndex); return <Panel key={stage} title={stage} subtitle={stageOrders.length + " pedidos"}><div className={`order-dropzone${dragOverStage === stageIndex ? " is-drag-over" : ""}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stageIndex); }} onDragLeave={() => setDragOverStage(current => current === stageIndex ? null : current)} onDrop={event => handleDrop(event, stageIndex)}>{stageOrders.map(order => <article aria-label={`Pedido ${order.id}. Segure e arraste para mudar de etapa.`} className={`proto-ticket order-card${draggedOrderId === order.id ? " is-dragging" : ""}`} draggable onDragEnd={() => { setDraggedOrderId(null); setDragOverStage(null); }} onDragStart={event => handleDragStart(event, order.id)} key={order.id}><div className="order-card-grab"><GripVertical aria-hidden="true" size={18} />Segure e arraste</div><div><Badge>{order.source === "whatsapp" ? "WhatsApp" : order.source}</Badge><h3>#{order.id.slice(0, 8)}</h3></div><p>{orderItemsLabel(order)}</p><strong>{formatOrderTotal(order)}</strong><small>{order.fulfillment === "delivery" ? `Entrega · ${order.deliveryAddress || "endereço pendente"}` : "Retirada na loja"}</small></article>)}{!stageOrders.length && <div className="order-dropzone-empty"><span>Solte aqui</span><small>Arraste um pedido para esta etapa</small></div>}</div></Panel>; })}</div>}
    {finalizingOrder && <div className="order-finalize-backdrop" role="presentation"><section className="proto-panel order-finalize-modal" role="dialog" aria-modal="true" aria-labelledby="order-finalize-title"><h3 id="order-finalize-title">Finalizar pedido #{finalizingOrder.id.slice(0, 8)}</h3><p>{orderItemsLabel(finalizingOrder)}</p><strong>Total: {formatOrderTotal(finalizingOrder)}</strong><label>Forma de pagamento<select autoFocus required value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as SalePaymentMethod | "")}><option value="">Escolha…</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option></select></label>{paymentMethod === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerId} onChange={setCreditCustomerId} disabled={finalizing} loading={creditLoading} />}<div className="proto-toolbar"><button type="button" disabled={!paymentMethod || finalizing} onClick={() => void finalizeOrder()}>{finalizing ? "Registrando venda…" : "Confirmar venda e fechar"}</button><button type="button" className="proto-subtle" disabled={finalizing} onClick={() => setFinalizingOrder(null)}>Cancelar</button></div></section></div>}
  </div>;
}
function Inventory() {
  const [tab, setTab] = useState("Posição atual");
  return <><Metrics items={[["Itens controlados", "18", "Itens cadastrados"], ["Abaixo do mínimo", "2", "Reposição sugerida"], ["Movimentações", "7", "Entradas e saídas do dia"]]} /><Tabs items={["Posição atual", "Movimentações", "Fichas técnicas"]} value={tab} onChange={setTab} />{tab === "Fichas técnicas" ? <Editor title="Receita do hambúrguer" tabs={["Ingredientes", "Rendimento", "Perdas"]} labels={["Produto vendido", "Rendimento", "Unidade"]} initialText="1 pão · 150 g de carne · 30 g de queijo." /> : <Records key={tab} title={tab} action="Nova movimentação" fields={["Item", "Unidade / origem", "Situação", "Quantidade"]} rows={tab === "Posição atual" ? [{ id: "i1", name: "Pão de hambúrguer", detail: "Unidade · mínimo 20", status: "Baixo", value: "12 un" }, { id: "i2", name: "Queijo", detail: "Quilograma · mínimo 2", status: "Regular", value: "5,2 kg" }, { id: "i3", name: "Refrigerante cola", detail: "Unidade · mínimo 12", status: "Regular", value: "36 un" }] : [{ id: "im1", name: "Entrada de queijo", detail: "Compra · fornecedor local", status: "Entrada", value: "+3 kg" }, { id: "im2", name: "Pão de hambúrguer", detail: "Venda #1043", status: "Saída", value: "−1 un" }]} />}</>;
}
function Finance() {
  const [cash, setCash] = useState<FoodCashSnapshot | null>(null);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const amountCents = (value: string) => Math.round(Number(value.replace(/[^0-9,-]/g, "").replace(",", ".")) * 100);
  const loadCash = async () => {
    try { setCash(await getFoodCashToday()); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o caixa."); }
  };
  useEffect(() => { void loadCash(); }, []);
  const open = async () => {
    const value = amountCents(opening);
    if (!Number.isSafeInteger(value) || value < 0) { setError("Informe o valor que está no caixa para abrir o dia."); return; }
    setBusy(true); setError("");
    try { setCash(await openFoodCash(value)); setOpening(""); setNotice("Caixa aberto. As vendas de hoje serão conferidas a partir deste saldo."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir o caixa."); } finally { setBusy(false); }
  };
  const close = async () => {
    const value = amountCents(counted);
    if (!Number.isSafeInteger(value) || value < 0) { setError("Informe quanto foi contado em dinheiro."); return; }
    setBusy(true); setError("");
    try { setCash(await closeFoodCash(value, notes)); setCounted(""); setNotice("Caixa fechado e conferência registrada."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível fechar o caixa."); } finally { setBusy(false); }
  };
  const session = cash?.session;
  const totals = cash?.totals ?? { pix: 0, cash: 0, card_credit: 0, card_debit: 0, meal_voucher: 0, crediario: 0 };
  return <div className="proto-stack"><Metrics items={[["Dinheiro esperado", money(cash?.expectedCashCents ?? 0), session ? session.status === "open" ? "Caixa aberto" : "Caixa fechado" : "Ainda não aberto"], ["Pix", money(totals.pix), "Vendas do caixa"], ["Cartões", money(totals.card_credit + totals.card_debit), "Crédito + débito"]]} />
    {!session ? <Panel title="Abrir caixa" subtitle="No começo do dia, informe quanto já existe em dinheiro no caixa."><div className="cash-flow-form"><label>Dinheiro inicial (R$)<input autoFocus inputMode="decimal" value={opening} onChange={event => setOpening(event.target.value)} placeholder="Ex.: 200,00" /></label><button type="button" disabled={busy} onClick={() => void open()}>{busy ? "Abrindo…" : "Abrir caixa"}</button></div></Panel> : <Panel title={session.status === "open" ? "Caixa aberto" : "Conferência concluída"} subtitle={`Dia ${session.businessDate} · abertura ${money(session.openingCashCents)}`}>
      <div className="cash-payment-grid"><div><span>Dinheiro vendido</span><strong>{money(totals.cash)}</strong></div><div><span>Cartão de crédito</span><strong>{money(totals.card_credit)}</strong></div><div><span>Cartão de débito</span><strong>{money(totals.card_debit)}</strong></div><div><span>Vale-alimentação</span><strong>{money(totals.meal_voucher)}</strong></div><div><span>Crediário</span><strong>{money(totals.crediario)}</strong></div></div>
      {session.status === "open" ? <div className="cash-flow-form"><label>Dinheiro contado no fechamento (R$)<input inputMode="decimal" value={counted} onChange={event => setCounted(event.target.value)} placeholder={`Esperado: ${money(cash?.expectedCashCents ?? 0)}`} /></label><label>Observação (opcional)<input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex.: diferença conferida" /></label><button type="button" disabled={busy} onClick={() => void close()}>{busy ? "Fechando…" : "Fechar caixa"}</button></div> : <p className="cash-close-result">Contado: <strong>{money(session.countedCashCents ?? 0)}</strong> · Diferença: <strong>{money(session.differenceCents ?? 0)}</strong></p>}
    </Panel>}
    {notice && <p role="status" className="proto-success">{notice}</p>}{error && <p role="alert" className="proto-form-error">{error}</p>}
  </div>;
}
function Fiscal() {
  const [tab, setTab] = useState("Documentos");
  return <><Metrics items={[["Ambiente", "Produção", "Comunicação fiscal"], ["Autorizados", "1", "Documentos autorizados"], ["Para revisão", "1", "Rejeição pendente"]]} /><Tabs items={["Documentos", "Revisão", "Configuração fiscal"]} value={tab} onChange={setTab} />{tab === "Configuração fiscal" ? <Editor title="Perfil fiscal da loja" tabs={["Estabelecimento", "Numeração", "Provedor", "Contingência"]} labels={["CNPJ", "UF", "Regime", "Série"]} /> : <Records key={tab} title={tab} action="Preparar rascunho" fields={["Documento", "Venda", "Situação", "Referência"]} rows={[{ id: "f1", name: "NFC-e 001", detail: "Venda #1042 · DANFE/XML", status: "Autorizado", value: "Documento fiscal" }, { id: "f2", name: "NFC-e 002", detail: "Venda #1043 · revisar perfil do produto", status: "Rejeitado", value: "Revisar cadastro" }]} />}</>;
}
