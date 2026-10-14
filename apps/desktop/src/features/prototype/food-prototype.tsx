import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { CalendarClock, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Editor, Metrics, OfflinePreview, Panel, Preferences, Records, Tabs, type RecordItem } from "@/components/shared/prototype-kit";
import { FoodServicePanel } from "@/features/service/food-service-panel";
import { CustomersPage } from "@/features/customers/customers-page";
import { ProductStock } from "./product-stock";
import { CreditPage } from "@/features/credit/credit-page";
import { FoodBackupPanel } from "@/features/system/food-backup-panel";
import { cancelFoodOrder, closeFoodCash, createFoodOrderSchedule, createFoodProducts, deleteFoodOrderSchedule, deleteFoodProduct, finalizeFoodOrder, getCreditLedger, getFoodCashToday, getFoodOrderSchedules, getFoodOrders, getFoodProducts, getFoodSales, openFoodCash, PRICE_ADJUSTMENT_REASONS, registerCounterSale, updateFoodOrderSchedule, updateFoodOrderStatus, updateFoodProduct, type CreditCustomerRecord, type FoodCashSnapshot, type FoodCounterSale, type FoodOrder, type FoodOrderSchedule, type FoodProduct, type FoodProductVariant, type ProductInput, type SalePaymentMethod } from "@/lib/food-api";
import { CreditCustomerPicker } from "@/components/shared/credit-customer-picker";

export const foodModules = {
  pos: ["PDV", "Monte a venda, confira os itens e escolha o pagamento."],
  orders: ["Pedidos", "Do recebimento à entrega, acompanhe cada etapa da operação."],
  service: ["Atendimento", "Conversas, carrinho e acompanhamento do WhatsApp."],
  credit: ["Crediário", "Consulte saldos e registre recebimentos."],
  products: ["Produtos", "Um catálogo para o balcão, o atendimento e os pedidos."],
  inventory: ["Estoque", "Acompanhe unidades congeladas, prontas e preparadas."],
  customers: ["Clientes", "Cadastre os contatos e os dados de entrega dos seus clientes."],
  finance: ["Caixa e financeiro", "Abertura, recebimentos, despesas e fechamento."],
  fiscal: ["Fiscal", "Documentos, revisão de rejeições e histórico por venda."],
  backup: ["Backup", "Backup automático, restauração e proteção dos dados da loja."],
  settings: ["Configurações", "Loja, equipe, permissões e preferências da operação."],
} as const;
export type FoodModule = keyof typeof foodModules;
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const scheduleWeekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const scheduleDaysFromJson = (value: string) => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) as number[] : [];
  } catch {
    return [];
  }
};
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
  const filtered = products.filter((product) => (!pos || (product.active && product.productionMode !== "ingredient" && (product.stockQuantity > 0 || product.unpreparedQuantity > 0 || product.productionMode === "made_here"))) && (category === "Todos" || category === product.productName) && `${product.name} ${product.productName} ${product.flavor ?? ""} ${product.familyName} ${product.aliases.join(" ")} ${product.variants.map((variant) => `${variant.name} ${variant.aliases.join(" ")}`).join(" ")}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
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
      const cash = await getFoodCashToday();
      if (!cash.session || cash.session.status !== "open") throw new Error("Abra o caixa antes de registrar uma venda.");
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

  const removeProduct = async (product: FoodProduct) => {
    if (!window.confirm(`Apagar “${product.name}” do catálogo? O histórico de vendas e pedidos será preservado.`)) return;
    setSaving(true);
    try {
      await deleteFoodProduct(product.id);
      setProducts(current => current.filter(item => item.id !== product.id));
      setNotice("Produto apagado do catálogo. O histórico foi preservado.");
      setError("");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Não foi possível apagar o produto.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="proto-stack">
    <Tabs items={categories} value={category} onChange={setCategory} />
    <div className="proto-toolbar"><label>Buscar produto ou sabor<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: esfi… ou carne" /></label>{!pos && <button type="button" onClick={() => { setEditingProduct(null); setShowForm((current) => !current); }}>Cadastrar produto</button>}</div>
    {!pos && search.trim() && familyEntries.some((group) => group.length > 1) && <div className="food-family-summary"><strong>Sabores encontrados</strong>{familyEntries.filter(group => group.length > 1).map(group => <span key={group[0].productName}><b>{group[0].productName}</b>: {group.map(product => product.flavor || "sem sabor").join(", ")}</span>)}</div>}
    {!pos && showForm && <ProductForm key={editingProduct?.id ?? "new"} products={products} initial={editingProduct} saving={saving} onCancel={() => { setShowForm(false); setEditingProduct(null); }} onSubmit={(input) => void saveProduct(input)} />}
    {loading ? <p className="proto-empty">Carregando catálogo…</p> : <div className={pos ? "proto-two" : ""}><div className="proto-three">{pos ? familyEntries.map(group => <ProductFamilyTile key={group[0].productName} products={group} selling={selling} onAdd={product => setCart(current => ({ ...current, [product.id]: current[product.id] ? { ...current[product.id], quantity: current[product.id].quantity + 1 } : newCartLine(product) }))} />) : filtered.map(product => <ProductTile key={product.id} product={product} busy={saving} onEdit={() => { setEditingProduct(product); setShowForm(true); }} onDelete={() => void removeProduct(product)} onStockSaved={loadProducts} />)}</div>
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

function ProductTile({ product, busy, onEdit, onDelete, onStockSaved }: { product: FoodProduct; busy: boolean; onEdit: () => void; onDelete: () => void; onStockSaved: () => Promise<void> }) {
  return <article className="proto-product">
    <div className="proto-product-art" aria-hidden="true">{productIcon(product.category)}</div>
    <small>Produto · {product.productName}{!product.active ? " · inativo" : ""}</small>
    <h3>{product.productName}</h3>
    {product.flavor && <span className="food-family-label">Sabor: {product.flavor}</span>}
    {product.productionMode !== "ingredient" && <strong>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Preço não informado"}</strong>}
    {product.costPriceCents > 0 && <small>Custo: {money(product.costPriceCents)} · margem: {money(Math.max(0, product.salePriceCents - product.costPriceCents))}</small>}
    <Badge>{!product.active ? "Inativo" : product.productionMode === "made_here" ? `${product.stockQuantity} prontos · preparo livre` : product.stockQuantity > 0 ? `${product.stockQuantity} prontos` : product.unpreparedQuantity > 0 ? `${product.unpreparedQuantity} congelados` : "Indisponível"}</Badge>
    {product.customization && <small>{product.customization.label}: base de {product.customization.baseQuantity} {product.customization.unit}</small>}
    {product.productionMode === "frozen" || product.productionMode === "resale" ? <small>{product.stockQuantity} prontos · {product.unpreparedQuantity} congelados</small> : product.productionMode === "ready" ? <small>Comprado pronto · sem etapa de preparo</small> : <small>Feito aqui · pode preparar na hora ou deixar pronto</small>}
    {product.variants.length > 0 && <small>Opções antigas: {product.variants.map(variant => variant.name).join(", ")}</small>}
    <small>{product.aliases.length ? `Também reconhece: ${product.aliases.join(", ")}` : "Sem alias cadastrado"}</small>
    <div className="food-product-actions"><button type="button" disabled={busy} onClick={onEdit}><Pencil size={15} />Editar</button><button type="button" className="food-delete-icon" disabled={busy} title="Apagar produto" aria-label={`Apagar ${product.name}`} onClick={onDelete}><Trash2 size={16} /></button></div>
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
    <strong>{readyTotal} prontos · {unpreparedTotal} congelados</strong>
    <small>Escolha o sabor para adicionar ao pedido.</small>
    <div className="food-flavor-options">
      {products.map(product => <div className="food-flavor-option" key={product.id}>
        <div><strong>{product.flavor || "Sem sabor"}</strong><small>{product.productionMode === "made_here" ? `${product.stockQuantity} prontos · preparo livre` : `${product.stockQuantity} prontos · ${product.unpreparedQuantity} congelados`}</small></div>
        <div className="food-flavor-option-action"><span>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Sem preço"}</span><button type="button" disabled={selling || product.salePriceCents <= 0 || (product.stockQuantity <= 0 && product.productionMode !== "made_here" && product.unpreparedQuantity <= 0)} onClick={() => onAdd(product)}>{product.salePriceCents <= 0 ? "Definir preço" : product.stockQuantity <= 0 && product.productionMode !== "made_here" ? "Preparar antes" : "Adicionar"}</button></div>
      </div>)}
    </div>
  </article>;
}

function ProductForm({ initial, products, saving, onCancel, onSubmit }: ProductFormProps) {
  const initialMode = initial?.productionMode === "resale" ? "frozen" : initial?.productionMode === "recipe" ? "made_here" : initial?.productionMode === "ingredient" ? "ready" : initial?.productionMode ?? "frozen";
  const [productionMode, setProductionMode] = useState<"frozen" | "ready" | "made_here">(initialMode as "frozen" | "ready" | "made_here");
  const [productName, setProductName] = useState(initial?.productName || initial?.familyName || initial?.name || "");
  const [flavorFields, setFlavorFields] = useState<string[]>([initial?.flavor ?? ""]);
  const [price, setPrice] = useState(initial ? String(initial.salePriceCents / 100).replace(".", ",") : "");
  const [costPrice, setCostPrice] = useState(initial ? String(initial.costPriceCents / 100).replace(".", ",") : "");
  const [initialStockByFlavor, setInitialStockByFlavor] = useState<Record<string, string>>(() => ({
    [stockFlavorKey(initial?.flavor ?? "")]: String(initial?.unpreparedQuantity ?? 0),
  }));
  const [initialReadyByFlavor, setInitialReadyByFlavor] = useState<Record<string, string>>(() => ({
    [stockFlavorKey(initial?.flavor ?? "")]: String(initial?.stockQuantity ?? 0),
  }));
  const [aliases, setAliases] = useState(initial?.aliases.join(", ") ?? "");
  const [variants, setVariants] = useState<FoodProductVariant[]>(initial?.variants.map((variant) => ({ ...variant })) ?? []);
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>(() => Object.fromEntries((initial?.variants ?? []).map((variant) => [variant.id, (variant.priceDeltaCents / 100).toFixed(2).replace(".", ",")] )));
  const [active, setActive] = useState(initial?.active ?? true);
  const [formError, setFormError] = useState("");
  const normalizedProductName = normalizeCatalogLabel(productName);
  const flavorNames = [...new Set(flavorFields.flatMap(splitCatalogValues))];
  const flavorRows = flavorNames.length ? flavorNames : [""];
  const productNameOptions = [...new Set(products.filter(product => product.productionMode !== "ingredient").map(product => product.productName).filter(Boolean))];
  const productSuggestions = productName.trim()
    ? productNameOptions.filter(option => normalizeCatalogLabel(option).includes(normalizedProductName) && normalizeCatalogLabel(option) !== normalizedProductName).slice(0, 6)
    : [];
  const relatedFlavors = products.filter(product => product.id !== initial?.id && product.productionMode !== "ingredient" && normalizeCatalogLabel(product.productName) === normalizedProductName && product.flavor);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const salePriceCents = price.trim() ? Math.round(Number(price.replace(",", ".")) * 100) : 0;
    if (!productName.trim() || !Number.isFinite(salePriceCents) || salePriceCents < 0) {
      setFormError("Informe o produto e um preço válido se quiser cadastrá-lo agora.");
      return;
    }
    const costPriceCents = costPrice.trim() ? Math.round(Number(costPrice.replace(",", ".")) * 100) : 0;
    if (!Number.isFinite(costPriceCents) || costPriceCents < 0) {
      setFormError("Informe um custo válido ou deixe o campo em branco.");
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
    const modeForSave = initial ? initial.productionMode : productionMode;
    const rows = initial ? [initial.flavor ?? ""] : flavorRows;
    const inputs = rows.map((rowFlavor) => {
      const initialQuantity = Number(initialStockByFlavor[stockFlavorKey(rowFlavor)] ?? 0);
      const initialReady = Number(initialReadyByFlavor[stockFlavorKey(rowFlavor)] ?? 0);
      return {
        productionMode: modeForSave,
        stockUnit: "un" as const,
        unitWeightGrams: null,
        unitVolumeMl: null,
        unpreparedQuantity: initial ? initial.unpreparedQuantity : modeForSave === "frozen" ? initialQuantity : 0,
        recipe: [],
        name: [productName.trim(), rowFlavor].filter(Boolean).join(" · "),
        productName: productName.trim(),
        flavor: rowFlavor || null,
        category: "Geral",
        aliases: aliasesList,
        variants: cleanedVariants,
        costPriceCents,
        salePriceCents,
        stockQuantity: initial ? initial.stockQuantity : initialReady,
        allowOnDemand: modeForSave === "made_here",
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
  const selectProductionMode = (mode: "frozen" | "ready" | "made_here") => {
    setProductionMode(mode);
  };

  return <form className="proto-form" onSubmit={submit}>
    <h3>{initial ? "Editar produto" : "Cadastrar produto"}</h3>
    <fieldset className="product-mode-field" disabled={Boolean(initial)}><legend>Como este produto chega?</legend><small className="product-mode-help">Escolha um dos três tipos de produto. Não há cadastro de insumos nem dependências.</small><div className="product-mode-grid"><button type="button" className={productionMode === "frozen" ? "is-selected" : ""} onClick={() => selectProductionMode("frozen")}><strong>Congelado</strong><small>Tem unidades congeladas para preparar e unidades já prontas.</small></button><button type="button" className={productionMode === "ready" ? "is-selected" : ""} onClick={() => selectProductionMode("ready")}><strong>Já pronto</strong><small>Você compra pronto. Ele entra direto como unidade pronta, sem preparo.</small></button><button type="button" className={productionMode === "made_here" ? "is-selected" : ""} onClick={() => selectProductionMode("made_here")}><strong>Faço aqui</strong><small>O preparo é ilimitado: pode fazer na hora ou deixar unidades prontas.</small></button></div></fieldset>
    <div className="food-product-basic-fields">
      <label>Produto-base<input type="text" autoComplete="off" required value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Ex.: Esfirra ou Pão com mortadela" /><small>Digite livremente o nome. Se já existir, sugestões aparecerão abaixo para reaproveitar o cadastro.</small></label>
      <div className="food-product-flavor-fields"><span className="food-assistant-field-label">{initial ? "Sabor" : "Sabores"} {!initial && <small>(um por campo)</small>}</span>{flavorFields.map((flavor, index) => <div className="food-product-flavor-row" key={index}><input type="text" autoComplete="off" value={flavor} onChange={(event) => setFlavorFields(current => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={index === 0 ? "Ex.: Carne" : "Outro sabor"} />{!initial && flavorFields.length > 1 && <button type="button" className="proto-subtle food-assistant-remove-flavor" aria-label={`Remover sabor ${index + 1}`} onClick={() => setFlavorFields(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>}</div>)}{!initial && <button type="button" className="proto-subtle food-assistant-add-flavor" onClick={() => setFlavorFields(current => [...current, ""])}><Plus size={15} />Adicionar sabor</button>}<small>{initial ? "Você pode alterar este sabor. Para adicionar outro sabor, cadastre-o no mesmo produto-base." : "Cada campo cria um produto separado, com estoque próprio por sabor."}</small></div>
      <label>Custo para você (R$)<input inputMode="decimal" value={costPrice} onChange={(event) => setCostPrice(event.target.value)} placeholder="Ex.: 2,50" /><small>Quanto este produto sai para você.</small></label>
      <label>Preço de venda (R$)<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Ex.: 5,00" /><small>Quanto será cobrado do cliente.</small></label>
      {productSuggestions.length > 0 && <div className="food-product-suggestions" role="listbox" aria-label="Produtos encontrados">{productSuggestions.map(option => <button type="button" key={option} onClick={() => setProductName(option)}>{option}</button>)}</div>}
      {relatedFlavors.length > 0 && <div className="food-family-notice"><strong>Sabores já cadastrados para “{productName}”</strong><small>{relatedFlavors.map(product => product.flavor).filter(Boolean).join(", ")}</small></div>}
    </div>
    {!initial && <section className="proto-variants-field food-flavor-stock-field"><strong>Estoque inicial por sabor</strong><small>Informe somente o que já existe agora. Os três tipos usam o mesmo produto separado por sabor.</small>{flavorRows.map(rowFlavor => <div className="food-flavor-stock-row" key={stockFlavorKey(rowFlavor)}><strong>{rowFlavor || "Produto sem sabor"}</strong>{productionMode === "frozen" && <label>Congelados<input type="number" min="0" step="1" value={initialStockByFlavor[stockFlavorKey(rowFlavor)] ?? "0"} onChange={event => setInitialStockByFlavor(current => ({ ...current, [stockFlavorKey(rowFlavor)]: event.target.value }))} /></label>}<label>Já preparados<input type="number" min="0" step="1" value={initialReadyByFlavor[stockFlavorKey(rowFlavor)] ?? "0"} onChange={event => setInitialReadyByFlavor(current => ({ ...current, [stockFlavorKey(rowFlavor)]: event.target.value }))} /></label></div>)}</section>}
    {initial && <small>O estoque pronto e o estoque congelado são alterados pelo botão de estoque, por sabor.</small>}
    {productionMode === "made_here" && <small>Este tipo não depende de estoque congelado: pode ser preparado na hora ou antecipadamente sem limite.</small>}
    <details className="proto-variants-field"><summary>Aliases e atendimento</summary>
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
    </details>
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
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [finalizingOrder, setFinalizingOrder] = useState<FoodOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod | "">("");
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomerRecord[]>([]);
  const [creditCustomerId, setCreditCustomerId] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalAdjustment, setFinalAdjustment] = useState("");
  const [finalAdjustmentNote, setFinalAdjustmentNote] = useState("");
  const [statusMessage, setStatusMessage] = useState("Carregando pedidos…");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ordersRequestRef = useRef(0);
  const hiddenOrderIdsRef = useRef(new Set<string>());
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [schedules, setSchedules] = useState<FoodOrderSchedule[]>([]);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleProducts, setScheduleProducts] = useState<FoodProduct[]>([]);
  const [allScheduleProducts, setAllScheduleProducts] = useState<FoodProduct[]>([]);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState<"daily" | "weekly">("daily");
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleQuantities, setScheduleQuantities] = useState<Record<string, number>>({});

  const loadOrders = async () => {
    const requestId = ++ordersRequestRef.current;
    try {
      const activeOrders = await getFoodOrders("active");
      if (requestId !== ordersRequestRef.current) return;
      setOrders(activeOrders.filter(order => !hiddenOrderIdsRef.current.has(order.id)));
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
      const adjustmentCents = parseCents(finalAdjustment);
      if (adjustmentCents !== 0 && !finalAdjustmentNote.trim()) {
        setError("Escolha a justificativa do ajuste antes de fechar a venda.");
        return;
      }
      const result = await finalizeFoodOrder(finalizingOrder.id, paymentMethod, paymentMethod === "crediario" ? creditCustomerId : null, adjustmentCents, finalAdjustmentNote);
      hiddenOrderIdsRef.current.add(finalizingOrder.id);
      ordersRequestRef.current += 1;
      setOrders(current => current.filter(item => item.id !== finalizingOrder.id));
      setStatusMessage(`${finalizingOrder.customerName || finalizingOrder.customer?.name || "Comanda sem nome"} finalizada e venda registrada.`);
      setFinalizingOrder(null); setPaymentMethod(""); setCreditCustomerId(""); setFinalAdjustment(""); setFinalAdjustmentNote(""); setError("");
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : "Não foi possível finalizar o pedido.");
    } finally {
      setFinalizing(false);
    }
  }

  async function cancelOrder(order: FoodOrder) {
    if (!window.confirm(`Fechar e cancelar ${order.customerName || order.customer?.name || "a comanda sem nome"}? Ela não será lançada no caixa.`)) return;
    try {
      await cancelFoodOrder(order.id);
      hiddenOrderIdsRef.current.add(order.id);
      ordersRequestRef.current += 1;
      setOrders(current => current.filter(item => item.id !== order.id));
      setStatusMessage(`${order.customerName || order.customer?.name || "Comanda sem nome"} fechada e cancelada.`);
      setError("");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Não foi possível fechar o pedido.");
    }
  }

  async function openSchedulePanel() {
    setScheduleOpen(true);
    setScheduleLoading(true);
    setScheduleError("");
    setScheduleNotice("");
    setEditingScheduleId(null);
    setScheduleName("");
    setScheduleSearch("");
    setScheduleFrequency("daily");
    setScheduleDays([]);
    setScheduleTime("09:00");
    setScheduleQuantities({});
    try {
      const [availableProducts, currentSchedules] = await Promise.all([getFoodProducts({ activeOnly: true }), getFoodOrderSchedules()]);
      const schedulableProducts = availableProducts.filter(product => product.productionMode !== "ingredient");
      setAllScheduleProducts(schedulableProducts);
      setScheduleProducts(schedulableProducts);
      setSchedules(currentSchedules);
    } catch (loadError) {
      setScheduleError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os agendamentos.");
    } finally {
      setScheduleLoading(false);
    }
  }

  async function saveSchedule() {
    const items = Object.entries(scheduleQuantities).filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
    if (scheduleFrequency === "weekly" && !scheduleDays.length) { setScheduleError("Escolha ao menos um dia da semana."); return; }
    if (!items.length) { setScheduleError("Selecione ao menos um produto ou sabor."); return; }
    setScheduleSaving(true);
    setScheduleError("");
    try {
      const input = { name: scheduleName.trim() || "Comanda sem nome", frequency: scheduleFrequency, weekdays: scheduleDays, timeLocal: scheduleTime, items };
      const schedule = editingScheduleId
        ? await updateFoodOrderSchedule(editingScheduleId, input)
        : await createFoodOrderSchedule(input);
      setSchedules(current => (editingScheduleId ? current.map(item => item.id === schedule.id ? schedule : item) : [...current, schedule]).sort((left, right) => Number(right.active) - Number(left.active) || new Date(left.nextRunAt).getTime() - new Date(right.nextRunAt).getTime()));
      const wasEditing = Boolean(editingScheduleId);
      setEditingScheduleId(null);
      setScheduleName("");
      setScheduleSearch("");
      setScheduleProducts(allScheduleProducts);
      setScheduleFrequency("daily");
      setScheduleDays([]);
      setScheduleTime("09:00");
      setScheduleQuantities({});
      setScheduleNotice(`${wasEditing ? "Agendamento atualizado" : "Agendamento criado"}. O próximo pedido será criado em ${new Date(schedule.nextRunAt).toLocaleString("pt-BR")}.`);
    } catch (saveError) {
      setScheduleError(saveError instanceof Error ? saveError.message : editingScheduleId ? "Não foi possível atualizar o agendamento." : "Não foi possível criar o agendamento.");
    } finally {
      setScheduleSaving(false);
    }
  }

  function updateScheduleSearch(value: string) {
    setScheduleSearch(value);
    const query = normalizeCatalogLabel(value);
    if (!query) {
      setScheduleProducts(allScheduleProducts);
      return;
    }
    setScheduleProducts(allScheduleProducts.filter(product => normalizeCatalogLabel([product.name, product.productName, product.flavor ?? "", product.familyName, ...product.aliases].join(" ")).includes(query)));
  }

  async function toggleSchedule(schedule: FoodOrderSchedule) {
    try {
      const updated = await updateFoodOrderSchedule(schedule.id, { active: !schedule.active });
      setSchedules(current => current.map(item => item.id === updated.id ? updated : item));
    } catch (toggleError) {
      setScheduleError(toggleError instanceof Error ? toggleError.message : "Não foi possível alterar o agendamento.");
    }
  }

  function editSchedule(schedule: FoodOrderSchedule) {
    setEditingScheduleId(schedule.id);
    setScheduleName(schedule.name);
    setScheduleSearch("");
    setScheduleProducts(allScheduleProducts);
    setScheduleFrequency(schedule.frequency === "weekly" ? "weekly" : "daily");
    setScheduleDays(scheduleDaysFromJson(schedule.weekdaysJson));
    setScheduleTime(schedule.timeLocal);
    setScheduleQuantities(Object.fromEntries(schedule.items.flatMap(item => item.productId ? [[item.productId, item.quantity] as const] : [])));
    setScheduleError("");
    setScheduleNotice("");
  }

  async function removeSchedule(schedule: FoodOrderSchedule) {
    if (!window.confirm(`Excluir o agendamento “${schedule.name}”? Os pedidos já criados serão preservados.`)) return;
    setScheduleSaving(true);
    setScheduleError("");
    try {
      await deleteFoodOrderSchedule(schedule.id);
      setSchedules(current => current.filter(item => item.id !== schedule.id));
      if (editingScheduleId === schedule.id) {
        setEditingScheduleId(null);
        setScheduleName("");
        setScheduleQuantities({});
      }
      setScheduleNotice("Agendamento excluído. Os pedidos já criados foram preservados.");
    } catch (removeError) {
      setScheduleError(removeError instanceof Error ? removeError.message : "Não foi possível excluir o agendamento.");
    } finally {
      setScheduleSaving(false);
    }
  }

  async function moveOrder(orderId: string, stage: number) {
    const order = orders.find(item => item.id === orderId);
    if (!order || stageForStatus(order.status) === stage) return;
    if (stage === 4) {
      setFinalizingOrder(order);
      setPaymentMethod("");
      setCreditCustomerId("");
      setFinalAdjustment("");
      setFinalAdjustmentNote("");
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
      setStatusMessage(`Pedido movido para ${stages[stage]}.${notificationMessage}`);
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
    <div className="proto-toolbar"><div><strong>Pedidos em andamento</strong><small className="block text-muted">Os pedidos são criados pelo Assistente. Arraste cada pedido pela operação; a venda só é registrada ao finalizar.</small></div><button type="button" onClick={() => void openSchedulePanel()}><CalendarClock size={16} />Agendar pedido</button></div>
    {!orders.length ? <Panel title="Pedidos"><p className="proto-empty">Nenhum pedido registrado ainda. Crie um pedido no balcão ou aguarde um pedido do WhatsApp.</p></Panel> : <div className="proto-orders-board">{stages.map((stage, stageIndex) => { const stageOrders = orders.filter(order => stageForStatus(order.status) === stageIndex); return <Panel key={stage} title={stage} subtitle={stageOrders.length + " pedidos"}><div className={`order-dropzone${dragOverStage === stageIndex ? " is-drag-over" : ""}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stageIndex); }} onDragLeave={() => setDragOverStage(current => current === stageIndex ? null : current)} onDrop={event => handleDrop(event, stageIndex)}>{stageOrders.map(order => { const expanded = expandedOrderId === order.id; return <article aria-label={`Pedido de ${order.customerName || order.customer?.name || "cliente"}. Clique para ver mais detalhes.`} className={`proto-ticket order-card${expanded ? " is-expanded" : ""}${draggedOrderId === order.id ? " is-dragging" : ""}`} draggable onClick={() => setExpandedOrderId(current => current === order.id ? null : order.id)} onDragEnd={() => { setDraggedOrderId(null); setDragOverStage(null); }} onDragStart={event => handleDragStart(event, order.id)} key={order.id}><button type="button" className="order-card-close" aria-label="Fechar pedido" title="Fechar pedido" onPointerDown={event => event.stopPropagation()} onClick={event => { event.preventDefault(); event.stopPropagation(); void cancelOrder(order); }}><X size={16} /></button><div className="order-card-grab"><GripVertical aria-hidden="true" size={18} />Segure e arraste</div><div className="order-card-heading"><div><Badge>{order.source === "whatsapp" ? "WhatsApp" : order.source === "scheduled" ? "Agendado" : "Balcão"}</Badge><h3>{order.customerName || order.customer?.name || "Cliente sem nome"}</h3></div><small>{new Date(order.createdAt).toLocaleString("pt-BR")}</small></div><p>{orderItemsLabel(order)}</p><strong>{formatOrderTotal(order)}</strong><small>{order.fulfillment === "delivery" ? `Entrega · ${order.deliveryAddress || "endereço pendente"}` : "Retirada na loja"}</small>{expanded && <div className="order-card-expanded-details"><div><span>Cliente</span><strong>{order.customerName || order.customer?.name || "Não informado"}</strong></div><div><span>Origem</span><strong>{order.source === "whatsapp" ? "WhatsApp" : order.source === "scheduled" ? "Agendado" : "Balcão"}</strong></div><div><span>Itens</span>{order.items.map(item => <small key={item.id}>{item.quantity} × {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}{item.fryNow ? " · preparar" : " · pronto"}</small>)}</div><div><span>Total atual</span><strong>{formatOrderTotal(order)}</strong></div></div>}</article>; })}{!stageOrders.length && <div className="order-dropzone-empty"><span>Solte aqui</span><small>Arraste um pedido para esta etapa</small></div>}</div></Panel>; })}</div>}
    {scheduleOpen && <div className="order-schedule-backdrop" role="presentation"><section className="proto-panel order-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="order-schedule-title"><header className="order-schedule-header"><div><h3 id="order-schedule-title">{editingScheduleId ? "Editar agendamento" : "Agendar pedido recorrente"}</h3><p>O Mosaico criará um novo pedido automaticamente no horário escolhido.</p></div><button type="button" className="proto-subtle" aria-label="Fechar agendamento" onClick={() => setScheduleOpen(false)} disabled={scheduleSaving}><X size={18} /></button></header>{scheduleNotice && <p role="status" className="proto-success">{scheduleNotice}</p>}{scheduleError && <p role="alert" className="proto-form-error">{scheduleError}</p>}{scheduleLoading ? <p className="proto-empty">Carregando produtos e agendamentos…</p> : <><div className="order-schedule-form-grid"><label>Nome do cliente<input autoFocus value={scheduleName} onChange={event => setScheduleName(event.target.value)} placeholder="Ex.: Maria" /></label><label>Horário<input type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} /></label><label>Repetição<select value={scheduleFrequency} onChange={event => setScheduleFrequency(event.target.value as "daily" | "weekly")}><option value="daily">Todos os dias</option><option value="weekly">Dias escolhidos da semana</option></select></label></div>{scheduleFrequency === "weekly" && <fieldset className="order-schedule-days"><legend>Executar em</legend><div>{scheduleWeekdays.map((day, index) => <button type="button" key={day} className={scheduleDays.includes(index) ? "is-selected" : ""} onClick={() => setScheduleDays(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index])}>{day}</button>)}</div></fieldset>}<section className="order-schedule-products"><strong>Produtos e sabores</strong><small>Marque os itens e informe a quantidade que entrará em cada pedido.</small><label className="order-schedule-search">Buscar produto ou sabor<input type="search" value={scheduleSearch} onChange={event => updateScheduleSearch(event.target.value)} placeholder="Digite para filtrar…" /></label>{scheduleProducts.length ? <div>{scheduleProducts.map(product => { const selected = scheduleQuantities[product.id] !== undefined; return <label className={`order-schedule-product${selected ? " is-selected" : ""}`} key={product.id}><input type="checkbox" checked={selected} onChange={() => setScheduleQuantities(current => { const next = { ...current }; if (next[product.id] === undefined) next[product.id] = 1; else delete next[product.id]; return next; })} /><span><strong>{product.productName || product.name}{product.flavor ? ` · ${product.flavor}` : ""}</strong><small>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Sem preço"}</small></span><input type="number" min="1" step="1" disabled={!selected} value={selected ? scheduleQuantities[product.id] : ""} onChange={event => setScheduleQuantities(current => ({ ...current, [product.id]: Number(event.target.value) || 0 }))} aria-label={`Quantidade de ${product.name}`} /></label>; })}</div> : <p className="proto-empty">Nenhum produto ativo disponível.</p>}</section>{schedules.length > 0 && <section className="order-schedule-existing"><strong>Agendamentos existentes</strong>{schedules.map(schedule => <article key={schedule.id}><div><strong>{schedule.name}</strong><small>{schedule.frequency === "daily" ? "Todos os dias" : scheduleDaysFromJson(schedule.weekdaysJson).map(day => scheduleWeekdays[day]).join(", ")} às {schedule.timeLocal} · próximo: {new Date(schedule.nextRunAt).toLocaleString("pt-BR")}</small>{schedule.lastError && <small className="is-error">{schedule.lastError}</small>}</div><div className="order-schedule-actions"><button type="button" className="proto-subtle" onClick={() => editSchedule(schedule)} disabled={scheduleSaving}>Editar</button><button type="button" className="proto-subtle" onClick={() => void toggleSchedule(schedule)} disabled={scheduleSaving}>{schedule.active ? "Pausar" : "Ativar"}</button><button type="button" className="proto-subtle order-schedule-delete" onClick={() => void removeSchedule(schedule)} disabled={scheduleSaving}>Excluir</button></div></article>)}</section>}<div className="proto-toolbar"><button type="button" disabled={scheduleSaving} onClick={() => void saveSchedule()}>{scheduleSaving ? "Salvando…" : editingScheduleId ? "Salvar alterações" : "Salvar agendamento"}</button><button type="button" className="proto-subtle" disabled={scheduleSaving} onClick={() => setScheduleOpen(false)}>Fechar</button></div></>}</section></div>}
    {finalizingOrder && <div className="order-finalize-backdrop" role="presentation"><section className="proto-panel order-finalize-modal" role="dialog" aria-modal="true" aria-labelledby="order-finalize-title"><h3 id="order-finalize-title">Finalizar pedido de {finalizingOrder.customerName || finalizingOrder.customer?.name || "cliente"}</h3><p>{orderItemsLabel(finalizingOrder)}</p><strong>Total: {formatOrderTotal(finalizingOrder)}</strong><label>Ajuste no total (R$)<input inputMode="decimal" value={finalAdjustment} onChange={event => setFinalAdjustment(event.target.value)} placeholder="0,00 ou -1,00" /><small>Faça o desconto ou adicional somente agora, antes de fechar a venda.</small></label>{parseCents(finalAdjustment) !== 0 && <label>Justificativa do ajuste<select required value={finalAdjustmentNote} onChange={event => setFinalAdjustmentNote(event.target.value)}><option value="">Escolha uma opção…</option>{PRICE_ADJUSTMENT_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}<label>Forma de pagamento<select autoFocus required value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as SalePaymentMethod | "")}><option value="">Escolha…</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option></select></label>{paymentMethod === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerId} onChange={setCreditCustomerId} disabled={finalizing} loading={creditLoading} />}<div className="proto-toolbar"><button type="button" disabled={!paymentMethod || finalizing} onClick={() => void finalizeOrder()}>{finalizing ? "Registrando venda…" : "Confirmar venda e fechar"}</button><button type="button" className="proto-subtle" disabled={finalizing} onClick={() => setFinalizingOrder(null)}>Cancelar</button></div></section></div>}
  </div>;
}
function Inventory() {
  const [tab, setTab] = useState("Posição atual");
  return <><Metrics items={[["Itens controlados", "18", "Itens cadastrados"], ["Abaixo do mínimo", "2", "Reposição sugerida"], ["Movimentações", "7", "Entradas e saídas do dia"]]} /><Tabs items={["Posição atual", "Movimentações", "Fichas técnicas"]} value={tab} onChange={setTab} />{tab === "Fichas técnicas" ? <Editor title="Receita do hambúrguer" tabs={["Ingredientes", "Rendimento", "Perdas"]} labels={["Produto vendido", "Rendimento", "Unidade"]} initialText="1 pão · 150 g de carne · 30 g de queijo." /> : <Records key={tab} title={tab} action="Nova movimentação" fields={["Item", "Unidade / origem", "Situação", "Quantidade"]} rows={tab === "Posição atual" ? [{ id: "i1", name: "Pão de hambúrguer", detail: "Unidade · mínimo 20", status: "Baixo", value: "12 un" }, { id: "i2", name: "Queijo", detail: "Quilograma · mínimo 2", status: "Regular", value: "5,2 kg" }, { id: "i3", name: "Refrigerante cola", detail: "Unidade · mínimo 12", status: "Regular", value: "36 un" }] : [{ id: "im1", name: "Entrada de queijo", detail: "Compra · fornecedor local", status: "Entrada", value: "+3 kg" }, { id: "im2", name: "Pão de hambúrguer", detail: "Venda #1043", status: "Saída", value: "−1 un" }]} />}</>;
}
function Finance() {
  const [cash, setCash] = useState<FoodCashSnapshot | null>(null);
  const [sales, setSales] = useState<FoodCounterSale[]>([]);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const amountCents = (value: string) => Math.round(Number(value.replace(/[^0-9,-]/g, "").replace(",", ".")) * 100);
  const loadCash = async () => {
    try { const [snapshot, history] = await Promise.all([getFoodCashToday(), getFoodSales()]); setCash(snapshot); setSales(history); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o caixa."); }
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
  const paymentLabel = (method: SalePaymentMethod | null) => method ? ({ pix: "Pix", cash: "Dinheiro", card_credit: "Cartão de crédito", card_debit: "Cartão de débito", meal_voucher: "Vale-alimentação", crediario: "Crediário" } as Record<SalePaymentMethod, string>)[method] : "Pendente";
  return <div className="proto-stack"><Metrics items={[["Dinheiro esperado", money(cash?.expectedCashCents ?? 0), session ? session.status === "open" ? "Caixa aberto" : "Caixa fechado" : "Ainda não aberto"], ["Pix", money(totals.pix), "Vendas do caixa"], ["Cartões", money(totals.card_credit + totals.card_debit), "Crédito + débito"]]} />
    {!session ? <Panel title="Abrir caixa" subtitle="No começo do dia, informe quanto já existe em dinheiro no caixa."><div className="cash-flow-form"><label>Dinheiro inicial (R$)<input autoFocus inputMode="decimal" value={opening} onChange={event => setOpening(event.target.value)} placeholder="Ex.: 200,00" /></label><button type="button" disabled={busy} onClick={() => void open()}>{busy ? "Abrindo…" : "Abrir caixa"}</button></div></Panel> : <Panel title={session.status === "open" ? "Caixa aberto" : "Conferência concluída"} subtitle={`Dia ${session.businessDate} · abertura ${money(session.openingCashCents)}`}>
      <div className="cash-payment-grid"><div><span>Dinheiro vendido</span><strong>{money(totals.cash)}</strong></div><div><span>Cartão de crédito</span><strong>{money(totals.card_credit)}</strong></div><div><span>Cartão de débito</span><strong>{money(totals.card_debit)}</strong></div><div><span>Vale-alimentação</span><strong>{money(totals.meal_voucher)}</strong></div><div><span>Crediário</span><strong>{money(totals.crediario)}</strong></div></div>
      {session.status === "open" ? <div className="cash-flow-form"><label>Dinheiro contado no fechamento (R$)<input inputMode="decimal" value={counted} onChange={event => setCounted(event.target.value)} placeholder={`Esperado: ${money(cash?.expectedCashCents ?? 0)}`} /></label><label>Observação (opcional)<input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex.: diferença conferida" /></label><button type="button" disabled={busy} onClick={() => void close()}>{busy ? "Fechando…" : "Fechar caixa"}</button></div> : <p className="cash-close-result">Contado: <strong>{money(session.countedCashCents ?? 0)}</strong> · Diferença: <strong>{money(session.differenceCents ?? 0)}</strong></p>}
    </Panel>}
    <Panel title="Histórico de vendas finalizadas" subtitle="Pedidos fechados aparecem aqui como vendas registradas no caixa.">{!sales.length ? <p className="proto-empty">Nenhuma venda finalizada ainda.</p> : <div className="proto-stack">{sales.map(sale => <article className="proto-ticket" key={sale.id}><div><strong>{sale.quantity} × {sale.productName}</strong><small>{paymentLabel(sale.paymentMethod)} · {new Date(sale.createdAt).toLocaleString("pt-BR")}</small></div><strong>{money(sale.totalCents)}</strong></article>)}</div>}</Panel>
    {notice && <p role="status" className="proto-success">{notice}</p>}{error && <p role="alert" className="proto-form-error">{error}</p>}
  </div>;
}
function Fiscal() {
  const [tab, setTab] = useState("Documentos");
  return <><Metrics items={[["Ambiente", "Produção", "Comunicação fiscal"], ["Autorizados", "1", "Documentos autorizados"], ["Para revisão", "1", "Rejeição pendente"]]} /><Tabs items={["Documentos", "Revisão", "Configuração fiscal"]} value={tab} onChange={setTab} />{tab === "Configuração fiscal" ? <Editor title="Perfil fiscal da loja" tabs={["Estabelecimento", "Numeração", "Provedor", "Contingência"]} labels={["CNPJ", "UF", "Regime", "Série"]} /> : <Records key={tab} title={tab} action="Preparar rascunho" fields={["Documento", "Venda", "Situação", "Referência"]} rows={[{ id: "f1", name: "NFC-e 001", detail: "Venda #1042 · DANFE/XML", status: "Autorizado", value: "Documento fiscal" }, { id: "f2", name: "NFC-e 002", detail: "Venda #1043 · revisar perfil do produto", status: "Rejeitado", value: "Revisar cadastro" }]} />}</>;
}
