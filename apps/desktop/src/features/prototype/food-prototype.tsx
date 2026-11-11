import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Boxes, CalendarClock, CircleAlert, GripVertical, LoaderCircle, PackagePlus, Trash2, X } from "lucide-react";
import { Badge, Panel, Records, Tabs, type RecordItem } from "@/components/shared/prototype-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ui-states";
import { FoodServicePanel } from "@/features/service/food-service-panel";
import { FoodOrderSuggestions } from "@/features/orders/food-order-suggestions";
import { CustomersPage } from "@/features/customers/customers-page";
import { CreditPage } from "@/features/credit/credit-page";
import { FinancePage } from "@/features/finance/finance-page";
import { FoodSettingsPanel } from "@/features/system/food-settings-panel";
import { FiscalPage } from "@/features/fiscal/fiscal-page";
import { cancelFoodOrder, closeFoodCash, createFoodOrderSchedule, deleteFoodOrderSchedule, deleteFoodProduct, finalizeFoodOrder, getCreditLedger, getFoodCashToday, getFoodOrderSchedules, getFoodOrders, getFoodProducts, getFoodSales, openFoodCash, PRICE_ADJUSTMENT_REASONS, registerCounterSale, updateFoodOrderSchedule, updateFoodOrderStatus, type CreditCustomerRecord, type FoodCashSnapshot, type FoodCounterSale, type FoodOrder, type FoodOrderSchedule, type FoodProduct, type SalePaymentMethod } from "@/lib/food-api";
import { CreditCustomerPicker } from "@/components/shared/credit-customer-picker";

export const foodModules = {
  pos: ["PDV", "Monte a venda, confira os itens e escolha o pagamento."],
  orders: ["Pedidos", "Do recebimento à entrega, acompanhe cada etapa da operação."],
  service: ["WhatsApp", "Atendimento manual pelo WhatsApp Web."],
  credit: ["Crediário", "Consulte saldos e registre recebimentos."],
  products: ["Produtos", "Consulte o catálogo. Cadastros e alterações são feitos pelo assistente."],
  inventory: ["Estoque", "Consulte quantidades. Entradas e perdas são feitas pelo assistente."],
  customers: ["Clientes", "Cadastre os contatos e os dados de entrega dos seus clientes."],
  finance: ["Caixa", "Abra o caixa do dia, acompanhe os recebimentos e confira o histórico."],
  fiscal: ["Fiscal", "Emissão opcional: escolha uma venda e emita a nota quando precisar."],
  settings: ["Configurações", "Loja, backup, impressão e atualizações."],
} as const;
export type FoodModule = keyof typeof foodModules;
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ingredientPackage = (product: FoodProduct) => product.stockUnit === "g" && product.unitWeightGrams ? `${product.unitWeightGrams >= 1000 && product.unitWeightGrams % 1000 === 0 ? product.unitWeightGrams / 1000 : product.unitWeightGrams} ${product.unitWeightGrams >= 1000 && product.unitWeightGrams % 1000 === 0 ? "kg" : "g"}` : product.stockUnit === "ml" && product.unitVolumeMl ? `${product.unitVolumeMl >= 1000 && product.unitVolumeMl % 1000 === 0 ? product.unitVolumeMl / 1000 : product.unitVolumeMl} ${product.unitVolumeMl >= 1000 && product.unitVolumeMl % 1000 === 0 ? "L" : "ml"}` : "1 un.";
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
  return <div className={`prototype prototype-${module}${module === "credit" ? " is-credit-view" : ""}`}>
    {module === "pos" && <header className="proto-heading proto-heading-compact"><h1>{foodModules[module][0]}</h1><p>{foodModules[module][1]}</p></header>}
    {module === "pos" && <Catalog pos />}
    {module === "products" && <Catalog />}
    {module === "orders" && <div className="orders-module"><div className="orders-suggestions-slot"><FoodOrderSuggestions /></div><Orders /></div>}
    {module === "service" && <FoodServicePanel />}
    {module === "credit" && <CreditPage />}
    {module === "inventory" && <Inventory />}
    {module === "customers" && <CustomersPage />}
    {module === "finance" && <FinancePage />}
    {module === "fiscal" && <FiscalPage />}
    {module === "settings" && <FoodSettingsPanel />}
  </div>;
}
function Catalog({ pos = false }: { pos?: boolean }) {
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [notice, setNotice] = useState("");
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      setProducts(await getFoodProducts({ activeOnly: !pos, availableOnly: pos }));
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

  const openProductEditor = (productId: string) => {
    window.dispatchEvent(new CustomEvent("food-open-assistant", { detail: { action: "edit", productId } }));
  };

  const openProductAction = (action: "loss" | "registerIngredient") => {
    window.dispatchEvent(new CustomEvent("food-open-assistant", { detail: { action } }));
  };

  const removeProduct = async (product: FoodProduct) => {
    const label = `${product.productName || product.name}${product.flavor ? ` · ${product.flavor}` : ""}`;
    if (!window.confirm(`Apagar ${label}? O item será desativado e não aparecerá mais no catálogo.`)) return;
    setError("");
    setNotice("");
    try {
      await deleteFoodProduct(product.id);
      setNotice(`${label} apagado.`);
      window.dispatchEvent(new Event("food-stock-changed"));
      await loadProducts();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Não foi possível apagar o produto.");
    }
  };

  const catalogProducts = pos
    ? products.filter(product => product.productionMode !== "ingredient")
    : products.filter(product => product.productionMode !== "ingredient");
  const categories = ["Todos", ...new Set(catalogProducts.map((product) => product.productName).filter(Boolean))];
  const selected = products.filter((product) => (cart[product.id]?.quantity ?? 0) > 0);
  const filtered = catalogProducts.filter((product) => (!pos || (product.active && product.stockQuantity > 0)) && (category === "Todos" || category === product.productName) && `${product.name} ${product.productName} ${product.flavor ?? ""} ${product.familyName} ${product.aliases.join(" ")} ${product.variants.map((variant) => `${variant.name} ${variant.aliases.join(" ")}`).join(" ")}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const familyGroups = filtered.reduce<Record<string, FoodProduct[]>>((groups, product) => {
    if (product.productName) groups[product.productName] = [...(groups[product.productName] ?? []), product];
    return groups;
  }, {});
  const familyEntries = Object.values(familyGroups);
  const total = paymentMethod === "brinde" ? 0 : selected.reduce((sum, product) => sum + lineUnitPrice(product, cart[product.id]) * cart[product.id].quantity, 0);
  async function finalizeSale() {
    if (selling || !selected.length) return;
    if (!paymentMethod) {
      setError("Escolha a forma de pagamento antes de confirmar a venda.");
      return;
    }
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
        const baseUnitPriceCents = baseLineUnitPrice(product, line);
        const isGiftSale = paymentMethod === "brinde";
        const unitPriceCents = isGiftSale ? 0 : lineUnitPrice(product, line);
        const adjustmentCents = isGiftSale ? 0 : unitPriceCents - baseUnitPriceCents;
        return {
          productId: product.id,
          quantity: line.quantity,
          unitPriceCents,
          customization: { ...(selectedQuantity === undefined ? {} : { selectedQuantity }), removedQuantity, addedItems: additionalItems },
          adjustmentCents,
          adjustmentNote: line.adjustmentNote.trim() || null,
          isGift: isGiftSale,
        };
      }) });
      setCart({}); setNotice(result.message); setError(""); await loadProducts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a venda."); }
    finally { setSelling(false); }
  }

  return <div className="proto-stack">
    {!pos && <div className="proto-toolbar products-quick-actions">
      <button type="button" className="proto-subtle" onClick={() => openProductAction("loss")}><Trash2 size={15} />Dar baixa como perda</button>
      <small>Clique em um produto para editar.</small>
    </div>}
    <Tabs items={categories} value={category} onChange={setCategory} />
    <div className="proto-toolbar"><label>Buscar produto ou sabor<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: esfi… ou carne" /></label></div>
    {!pos && search.trim() && familyEntries.some((group) => group.length > 1) && <div className="food-family-summary"><strong>Sabores encontrados</strong>{familyEntries.filter(group => group.length > 1).map(group => <span key={group[0].productName}><b>{group[0].productName}</b>: {group.map(product => product.flavor || "sem sabor").join(", ")}</span>)}</div>}
    {loading ? <p className="proto-empty">Carregando catálogo…</p> : <div className={pos ? "proto-two" : "products-list-shell"}>{pos ? <div className="proto-three">{familyEntries.map(group => <ProductFamilyTile key={group[0].productName} products={group} selling={selling} onAdd={product => setCart(current => ({ ...current, [product.id]: current[product.id] ? { ...current[product.id], quantity: current[product.id].quantity + 1 } : newCartLine(product) }))} />)}</div> : <div className="inventory-list products-list" aria-label="Produtos cadastrados">{filtered.map(product => <ProductTile key={product.id} product={product} onEdit={openProductEditor} onDelete={product => void removeProduct(product)} />)}</div>}
      {!filtered.length && <p className="proto-empty">{pos ? "Nenhum produto disponível para venda no momento." : "Nenhum produto ativo encontrado. Use o Assistente da loja para cadastrar o primeiro."}</p>}
      {pos && <Panel title="Venda de balcão" subtitle="Ajuste adicionais, remoções ou escolha Brinde no pagamento antes de confirmar.">
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
                <label>Preço da venda (R$)<input inputMode="decimal" value={(paymentMethod === "brinde" ? 0 : lineUnitPrice(product, line) / 100).toFixed(2).replace(".", ",")} disabled={selling || paymentMethod === "brinde"} onChange={event => setCart(current => ({ ...current, [product.id]: { ...current[product.id], unitPriceCents: parseCents(event.target.value) } }))} placeholder="Ex.: 8,00" /><small>{paymentMethod === "brinde" ? "A forma de pagamento Brinde zera o valor de todos os itens." : "O preço cadastrado aparece aqui. Se alterar, informe o motivo."}</small></label>
                {(paymentMethod === "brinde" || lineUnitPrice(product, line) !== baseLineUnitPrice(product, line) || removedQuantity > 0 || selectedQuantity > (product.customization?.baseQuantity ?? 0) || line.addedItems.length > 0) && <label>{paymentMethod === "brinde" ? "Motivo do brinde" : "Motivo da alteração"}<select required value={line.adjustmentNote} disabled={selling} onChange={event => setCart(current => ({ ...current, [product.id]: { ...current[product.id], adjustmentNote: event.target.value } }))}><option value="">Escolha uma opção…</option>{PRICE_ADJUSTMENT_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}
              </div>
            </div>;
          })}
        </div>
        {!selected.length && <p className="proto-empty">Selecione os produtos ao lado.</p>}
        <dl className="proto-facts"><div><dt>Total</dt><dd>{money(total)}</dd></div></dl>
        <label>Pagamento recebido<select required disabled={selling} value={paymentMethod ?? ""} onChange={event => setPaymentMethod(event.target.value ? event.target.value as SalePaymentMethod : null)}><option value="">Escolha uma forma de pagamento…</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option><option value="brinde">Brinde (sem cobrança)</option></select></label>
        {paymentMethod === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerId} onChange={setCreditCustomerId} disabled={selling} loading={creditLoading} />}
        <div className="proto-toolbar"><button type="button" disabled={selling || !selected.length || !paymentMethod} onClick={() => void finalizeSale()}>{selling ? "Registrando…" : "Confirmar venda"}</button></div>
      </Panel>}
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
      setProducts(await getFoodProducts({ activeOnly: true }));
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

  const openEditor = (productId: string) => {
    window.dispatchEvent(new CustomEvent("food-open-assistant", { detail: { action: "edit", productId } }));
  };

  const removeItem = async (product: FoodProduct) => {
    const label = `${product.name}${product.flavor ? ` · ${product.flavor}` : ""}`;
    if (!window.confirm(`Apagar ${label} do estoque? O item será desativado.`)) return;
    setError("");
    try {
      await deleteFoodProduct(product.id);
      window.dispatchEvent(new Event("food-stock-changed"));
      await loadProducts();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Não foi possível apagar o item.");
    }
  };

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = products.filter(product => {
    const matchesKind = kind === "all" || (kind === "ingredients" ? product.productionMode === "ingredient" : product.productionMode !== "ingredient");
    const matchesSearch = `${product.name} ${product.category} ${product.aliases.join(" ")}`.toLocaleLowerCase("pt-BR").includes(query);
    return matchesKind && matchesSearch;
  });

  return <div className="proto-stack">
    <p className="assistant-only-note">Use o Assistente da loja para cadastrar itens, receber estoque e registrar perdas.</p>
    <div className="proto-toolbar">
      <label>Buscar no estoque<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Produto, ingrediente ou categoria…" /></label>
      <label>Tipo<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">Todos</option><option value="products">Produtos</option><option value="ingredients">Insumos</option></select></label>
    </div>
    {loading && <LoadingState icon={LoaderCircle} title="Carregando estoque" description="Buscando os produtos e ingredientes da loja." />}
    {!loading && error && <div className="proto-stack"><ErrorState icon={CircleAlert} title="Não foi possível carregar o estoque" description={error} /><button type="button" onClick={() => void loadProducts(true)}>Tentar novamente</button></div>}
    {!loading && !error && products.length === 0 && <EmptyState icon={Boxes} title="Estoque vazio" description="Use o Assistente da loja para cadastrar o primeiro produto ou insumo." />}
    {!loading && !error && products.length > 0 && filtered.length === 0 && <p className="proto-empty">Nenhum item corresponde à busca ou ao tipo selecionado.</p>}
    {!loading && !error && filtered.length > 0 && <div className="inventory-list" aria-label="Produtos e ingredientes em estoque">
      {filtered.map(product => <article className="inventory-row is-clickable" key={product.id} role="button" tabIndex={0} onClick={() => openEditor(product.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEditor(product.id); } }}>
        <div className="inventory-row-name">
          <div><h2>{product.name}</h2><small>{product.category} · {product.productionMode === "ingredient" ? "Insumo" : "Produto"}</small></div>
        </div>
        <dl className="inventory-quantities">
          <div><dt>Disponível</dt><dd>{product.stockQuantity} {product.productionMode === "ingredient" ? product.stockUnit : "un"}</dd></div>
          {product.productionMode === "ingredient" && (product.unitWeightGrams || product.unitVolumeMl) && <div className="inventory-unit-detail"><dt>Por unidade</dt><dd>{[product.unitWeightGrams && `${product.unitWeightGrams} g`, product.unitVolumeMl && `${product.unitVolumeMl} ml`].filter(Boolean).join(" · ")}</dd></div>}
        </dl>
        <div className="product-row-actions">
          <button type="button" className="product-action-button is-danger" title="Apagar item" aria-label={`Apagar ${product.name}`} onClick={event => { event.stopPropagation(); void removeItem(product); }}><Trash2 size={14} /></button>
        </div>
      </article>)}
    </div>}
  </div>;
}

function ActionModal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div className="food-action-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="food-action-modal" role="dialog" aria-modal="true" aria-labelledby="food-action-modal-title">
      <header className="food-action-modal-header"><div><span>Assistente</span><h2 id="food-action-modal-title">{title}</h2><p>{subtitle}</p></div><button type="button" className="proto-subtle food-action-close" aria-label="Fechar" onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

type CartLine = {
  quantity: number;
  selectedQuantity?: number;
  addedItems: string[];
  unitPriceCents?: number;
  adjustmentNote: string;
};

function newCartLine(product: FoodProduct): CartLine {
  return {
    quantity: 1,
    ...(product.customization ? { selectedQuantity: product.customization.baseQuantity } : {}),
    addedItems: [],
    adjustmentNote: "",
  };
}

function parseCents(value: string) {
  const normalized = value.replace(/[^0-9,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function baseLineUnitPrice(product: FoodProduct, line: CartLine) {
  const customization = product.customization;
  const selectedQuantity = customization ? line.selectedQuantity ?? customization.baseQuantity : 0;
  const additionalQuantity = customization ? Math.max(0, selectedQuantity - customization.baseQuantity) : 0;
  return product.salePriceCents + additionalQuantity * (customization?.additionalUnitPriceCents ?? 0);
}

function lineUnitPrice(product: FoodProduct, line: CartLine) {
  return Math.max(0, line.unitPriceCents ?? baseLineUnitPrice(product, line));
}

function ProductTile({ product, onEdit, onDelete }: { product: FoodProduct; onEdit: (id: string) => void; onDelete: (product: FoodProduct) => void }) {
  const isIngredient = product.productionMode === "ingredient";
  const typeLabel = isIngredient ? "Insumo" : "Produto";
  return <article className="inventory-row product-row is-clickable" role="button" tabIndex={0} onClick={() => onEdit(product.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(product.id); } }}>
    <div className="inventory-row-name">
      <div><h2>{product.productName || product.name}</h2><small>{typeLabel}{product.flavor ? ` · ${product.flavor}` : ""}{!product.active ? " · inativo" : ""}</small>{product.aliases.length > 0 && <small>Reconhece: {product.aliases.join(", ")}</small>}</div>
      <Badge>{!product.active ? "Inativo" : isIngredient ? "Insumo" : product.salePriceCents > 0 ? "Ativo" : "Sem preço"}</Badge>
    </div>
    <dl className="inventory-quantities">
      {!isIngredient && <div><dt>Preço de venda</dt><dd>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Não informado"}</dd></div>}
      <div><dt>Disponível</dt><dd>{product.stockQuantity} {isIngredient ? product.stockUnit : "un"}</dd></div>
      <div><dt>{isIngredient ? "Custo da embalagem" : "Custo"}</dt><dd>{product.costPriceCents > 0 ? money(product.costPriceCents) : "Não informado"}</dd></div>
      {!isIngredient && <div className="inventory-unit-detail"><dt>Fiscal</dt><dd>{product.fiscalNcm ? `NCM ${product.fiscalNcm} · CFOP ${product.fiscalCfop ?? "—"}` : "Perfil fiscal pendente"}</dd></div>}
      {isIngredient && (product.unitWeightGrams || product.unitVolumeMl) && <div className="inventory-unit-detail"><dt>Por unidade</dt><dd>{ingredientPackage(product)}</dd></div>}
    </dl>
    <div className="product-row-actions">
      <button type="button" className="product-action-button is-danger" title="Apagar produto" aria-label={`Apagar ${product.productName || product.name}`} onClick={event => { event.stopPropagation(); onDelete(product); }}><Trash2 size={14} /></button>
    </div>
  </article>;
}

function ProductFamilyTile({ products, selling, onAdd }: { products: FoodProduct[]; selling: boolean; onAdd: (product: FoodProduct) => void }) {
  const family = products[0];
  const stockTotal = products.reduce((sum, product) => sum + product.stockQuantity, 0);
  return <article className="proto-product food-product-family-card">
    <div className="proto-product-art" aria-hidden="true">{productIcon(family.category)}</div>
    <small>Produto</small>
    <h3>{family.productName}</h3>
    <strong>{stockTotal} em estoque</strong>
    <small>Escolha o sabor para adicionar ao pedido.</small>
    <div className="food-flavor-options">
      {products.map(product => <div className="food-flavor-option" key={product.id}>
        <div><strong>{product.flavor || "Sem sabor"}</strong><small>{product.stockQuantity} em estoque</small></div>
        <div className="food-flavor-option-action"><span>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Sem preço"}</span><button type="button" disabled={selling || product.salePriceCents <= 0 || product.stockQuantity <= 0} onClick={() => onAdd(product)}>{product.salePriceCents <= 0 ? "Definir preço" : product.stockQuantity <= 0 ? "Sem estoque" : "Adicionar"}</button></div>
      </div>)}
    </div>
  </article>;
}

function Orders() {
  const stages = ["Recebido", "Em trânsito", "Finalizado"];
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
  const [finalCashReceived, setFinalCashReceived] = useState("");
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

  const stageForStatus = (status: string) => ({ confirmed: 0, preparing: 0, ready: 0, out_for_delivery: 1, delivered: 2 }[status] ?? 0);
  const statusForStage = (stage: number) => (["confirmed", "out_for_delivery", "delivered"] as const)[stage];
  const orderItemsLabel = (order: FoodOrder) => order.items.map((item) => `${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}${item.isGift ? " · brinde" : ""}`).join(" · ");
  const formatOrderTotal = (order: FoodOrder) => money(order.totalCents);
  const formatOrderPayment = (order: FoodOrder) => `${order.paymentMethod === "pix" ? "Pix" : order.paymentMethod === "cash" ? "Dinheiro" : order.paymentMethod === "card_credit" ? "Cartão de crédito" : order.paymentMethod === "card_debit" ? "Cartão de débito" : order.paymentMethod === "meal_voucher" ? "Vale-alimentação" : order.paymentMethod === "crediario" ? "Crediário" : "Pagamento pendente"}${order.paymentMethod === "cash" && order.cashChangeCents ? ` · Troco ${money(order.cashChangeCents)}` : ""}`;
  const detailOrder = orders.find(order => order.id === expandedOrderId) ?? null;

  function openFinalization(order: FoodOrder) {
    setExpandedOrderId(null);
    setFinalizingOrder(order);
    setPaymentMethod(order.paymentMethod ?? "");
    setCreditCustomerId("");
    setFinalAdjustment((order.totalCents / 100).toFixed(2).replace(".", ","));
    setFinalAdjustmentNote("");
    setFinalCashReceived(order.paymentMethod === "cash" && order.cashReceivedCents ? (order.cashReceivedCents / 100).toFixed(2).replace(".", ",") : "");
  }

  async function finalizeOrder() {
    if (!finalizingOrder || !paymentMethod || finalizing) return;
    if (paymentMethod === "crediario" && !creditCustomerId) {
      setError("Selecione o cliente do crediário antes de finalizar.");
      return;
    }
    setFinalizing(true);
    try {
      const finalTotalCents = parseCents(finalAdjustment);
      if (finalTotalCents < 0) {
        setError("Informe um valor final válido para a venda.");
        return;
      }
      const adjustmentCents = finalTotalCents - finalizingOrder.totalCents;
      if (adjustmentCents !== 0 && !finalAdjustmentNote.trim()) {
        setError("Escolha a justificativa da alteração de valor antes de fechar a venda.");
        return;
      }
      const cashReceivedCents = paymentMethod === "cash" && finalCashReceived.trim() ? parseCents(finalCashReceived) : undefined;
      if (paymentMethod === "cash" && cashReceivedCents !== undefined && cashReceivedCents < finalTotalCents) {
        setError(`O dinheiro entregue precisa ser pelo menos ${money(finalTotalCents)}.`);
        return;
      }
      const result = await finalizeFoodOrder(finalizingOrder.id, paymentMethod, paymentMethod === "crediario" ? creditCustomerId : null, adjustmentCents, finalAdjustmentNote, cashReceivedCents);
      hiddenOrderIdsRef.current.add(finalizingOrder.id);
      ordersRequestRef.current += 1;
      setOrders(current => current.filter(item => item.id !== finalizingOrder.id));
      setStatusMessage(`${finalizingOrder.customerName || finalizingOrder.customer?.name || "Comanda sem nome"} finalizada e venda registrada.`);
      setFinalizingOrder(null); setPaymentMethod(""); setCreditCustomerId(""); setFinalAdjustment(""); setFinalAdjustmentNote(""); setFinalCashReceived(""); setError("");
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
      setStatusMessage(`${order.customerName || order.customer?.name || "Comanda sem nome"} fechada e cancelada; estoque devolvido.`);
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
    if (stage === 1 && order.fulfillment !== "delivery") {
      setError("Pedidos para retirada vão direto de Recebido para Finalizado.");
      return;
    }
    if (stage === 2) {
      openFinalization(order);
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
    <div className="orders-toolbar"><div className="orders-toolbar-summary"><span className="orders-toolbar-kicker">Operação agora</span><strong>{orders.length}</strong><span>em andamento</span></div><button type="button" className="orders-schedule-button" onClick={() => void openSchedulePanel()}><CalendarClock size={15} />Agenda</button></div>
    {!orders.length ? <Panel title="Pedidos"><p className="proto-empty">Nenhum pedido registrado ainda. Crie um pedido no balcão ou aguarde um pedido do WhatsApp.</p></Panel> : <div className="proto-orders-board">{stages.map((stage, stageIndex) => { const stageOrders = orders.filter(order => stageForStatus(order.status) === stageIndex); return <Panel key={stage} title={stage} subtitle={stageOrders.length + " pedidos"}><div className={`order-dropzone${dragOverStage === stageIndex ? " is-drag-over" : ""}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stageIndex); }} onDragLeave={() => setDragOverStage(current => current === stageIndex ? null : current)} onDrop={event => handleDrop(event, stageIndex)}>{stageOrders.map(order => { const expanded = expandedOrderId === order.id; return <article aria-label={`Pedido de ${order.customerName || order.customer?.name || "cliente"}. Clique para ver mais detalhes.`} className={`proto-ticket order-card${expanded ? " is-expanded" : ""}${draggedOrderId === order.id ? " is-dragging" : ""}`} draggable onClick={() => setExpandedOrderId(current => current === order.id ? null : order.id)} onDragEnd={() => { setDraggedOrderId(null); setDragOverStage(null); }} onDragStart={event => handleDragStart(event, order.id)} key={order.id}><button type="button" className="order-card-close" aria-label="Fechar pedido" title="Fechar pedido" onPointerDown={event => event.stopPropagation()} onClick={event => { event.preventDefault(); event.stopPropagation(); void cancelOrder(order); }}><X size={16} /></button><div className="order-card-grab"><GripVertical aria-hidden="true" size={18} />Segure e arraste</div><div className="order-card-heading"><div><Badge>{order.source === "whatsapp" ? "WhatsApp" : order.source === "scheduled" ? "Agendado" : "Balcão"}</Badge><h3>{order.customerName || order.customer?.name || "Cliente sem nome"}</h3></div><small>{new Date(order.createdAt).toLocaleString("pt-BR")}</small></div><p>{orderItemsLabel(order)}</p><strong>{formatOrderTotal(order)}</strong><small>{order.fulfillment === "delivery" ? `Entrega · ${order.deliveryAddress || "endereço pendente"}` : "Retirada na loja"} · {formatOrderPayment(order)}</small>{expanded && <div className="order-card-expanded-details"><div><span>Cliente</span><strong>{order.customerName || order.customer?.name || "Não informado"}</strong></div><div><span>Origem</span><strong>{order.source === "whatsapp" ? "WhatsApp" : order.source === "scheduled" ? "Agendado" : "Balcão"}</strong></div><div><span>Pagamento</span><strong>{order.paymentMethod || "Pendente"}</strong></div>{order.paymentMethod === "cash" && order.cashChangeCents ? <div><span>Troco</span><strong>{money(order.cashChangeCents)} (entregue {money(order.cashReceivedCents || 0)})</strong></div> : null}<div><span>Itens</span>{order.items.map(item => <small key={item.id}>{item.quantity} × {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</small>)}</div><div><span>Total atual</span><strong>{formatOrderTotal(order)}</strong></div></div>}</article>; })}{!stageOrders.length && <div className="order-dropzone-empty"><span>Solte aqui</span><small>Arraste um pedido para esta etapa</small></div>}</div></Panel>; })}</div>}
    {scheduleOpen && <div className="order-schedule-backdrop" role="presentation"><section className="proto-panel order-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="order-schedule-title"><header className="order-schedule-header"><div><h3 id="order-schedule-title">{editingScheduleId ? "Editar agendamento" : "Agendar pedido recorrente"}</h3><p>O Mosaico criará um novo pedido automaticamente no horário escolhido.</p></div><button type="button" className="proto-subtle" aria-label="Fechar agendamento" onClick={() => setScheduleOpen(false)} disabled={scheduleSaving}><X size={18} /></button></header>{scheduleNotice && <p role="status" className="proto-success">{scheduleNotice}</p>}{scheduleError && <p role="alert" className="proto-form-error">{scheduleError}</p>}{scheduleLoading ? <p className="proto-empty">Carregando produtos e agendamentos…</p> : <><div className="order-schedule-form-grid"><label>Nome do cliente<input autoFocus value={scheduleName} onChange={event => setScheduleName(event.target.value)} placeholder="Ex.: Maria" /></label><label>Horário<input type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} /></label><label>Repetição<select value={scheduleFrequency} onChange={event => setScheduleFrequency(event.target.value as "daily" | "weekly")}><option value="daily">Todos os dias</option><option value="weekly">Dias escolhidos da semana</option></select></label></div>{scheduleFrequency === "weekly" && <fieldset className="order-schedule-days"><legend>Executar em</legend><div>{scheduleWeekdays.map((day, index) => <button type="button" key={day} className={scheduleDays.includes(index) ? "is-selected" : ""} onClick={() => setScheduleDays(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index])}>{day}</button>)}</div></fieldset>}<section className="order-schedule-products"><strong>Produtos e sabores</strong><small>Marque os itens e informe a quantidade que entrará em cada pedido.</small><label className="order-schedule-search">Buscar produto ou sabor<input type="search" value={scheduleSearch} onChange={event => updateScheduleSearch(event.target.value)} placeholder="Digite para filtrar…" /></label>{scheduleProducts.length ? <div>{scheduleProducts.map(product => { const selected = scheduleQuantities[product.id] !== undefined; return <label className={`order-schedule-product${selected ? " is-selected" : ""}`} key={product.id}><input type="checkbox" checked={selected} onChange={() => setScheduleQuantities(current => { const next = { ...current }; if (next[product.id] === undefined) next[product.id] = 1; else delete next[product.id]; return next; })} /><span><strong>{product.productName || product.name}{product.flavor ? ` · ${product.flavor}` : ""}</strong><small>{product.salePriceCents > 0 ? money(product.salePriceCents) : "Sem preço"}</small></span><input type="number" min="1" step="1" disabled={!selected} value={selected ? scheduleQuantities[product.id] : ""} onChange={event => setScheduleQuantities(current => ({ ...current, [product.id]: Number(event.target.value) || 0 }))} aria-label={`Quantidade de ${product.name}`} /></label>; })}</div> : <p className="proto-empty">Nenhum produto ativo disponível.</p>}</section>{schedules.length > 0 && <section className="order-schedule-existing"><strong>Agendamentos existentes</strong>{schedules.map(schedule => <article key={schedule.id}><div><strong>{schedule.name}</strong><small>{schedule.frequency === "daily" ? "Todos os dias" : scheduleDaysFromJson(schedule.weekdaysJson).map(day => scheduleWeekdays[day]).join(", ")} às {schedule.timeLocal} · próximo: {new Date(schedule.nextRunAt).toLocaleString("pt-BR")}</small>{schedule.lastError && <small className="is-error">{schedule.lastError}</small>}</div><div className="order-schedule-actions"><button type="button" className="proto-subtle" onClick={() => editSchedule(schedule)} disabled={scheduleSaving}>Editar</button><button type="button" className="proto-subtle" onClick={() => void toggleSchedule(schedule)} disabled={scheduleSaving}>{schedule.active ? "Pausar" : "Ativar"}</button><button type="button" className="proto-subtle order-schedule-delete" onClick={() => void removeSchedule(schedule)} disabled={scheduleSaving}>Excluir</button></div></article>)}</section>}<div className="proto-toolbar"><button type="button" disabled={scheduleSaving} onClick={() => void saveSchedule()}>{scheduleSaving ? "Salvando…" : editingScheduleId ? "Salvar alterações" : "Salvar agendamento"}</button><button type="button" className="proto-subtle" disabled={scheduleSaving} onClick={() => setScheduleOpen(false)}>Fechar</button></div></>}</section></div>}
    {finalizingOrder && <div className="order-finalize-backdrop" role="presentation"><section className="proto-panel order-finalize-modal" role="dialog" aria-modal="true" aria-labelledby="order-finalize-title"><h3 id="order-finalize-title">Finalizar pedido de {finalizingOrder.customerName || finalizingOrder.customer?.name || "cliente"}</h3><p>{orderItemsLabel(finalizingOrder)}</p><strong>Total cadastrado: {formatOrderTotal(finalizingOrder)}</strong><label>Total da venda (R$)<input inputMode="decimal" value={finalAdjustment} onChange={event => setFinalAdjustment(event.target.value)} placeholder="Ex.: 25,00" /><small>O total atual aparece preenchido. Se editar, o Mosaico exige uma justificativa.</small></label>{parseCents(finalAdjustment) !== finalizingOrder.totalCents && <label>Justificativa da alteração<select required value={finalAdjustmentNote} onChange={event => setFinalAdjustmentNote(event.target.value)}><option value="">Escolha uma opção…</option>{PRICE_ADJUSTMENT_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}<label>Forma de pagamento<select autoFocus required value={paymentMethod} onChange={event => { const next = event.target.value as SalePaymentMethod | ""; setPaymentMethod(next); if (next !== "cash") setFinalCashReceived(""); }}><option value="">Escolha…</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option></select></label>{paymentMethod === "cash" && <label>Dinheiro entregue (troco para)<input inputMode="decimal" value={finalCashReceived} onChange={event => setFinalCashReceived(event.target.value)} placeholder={finalAdjustment || "Valor exato"} /><small>Deixe em branco para o valor exato. Se já veio troco do atendimento, ele aparece preenchido.</small></label>}{paymentMethod === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerId} onChange={setCreditCustomerId} disabled={finalizing} loading={creditLoading} />}<div className="proto-toolbar"><button type="button" disabled={!paymentMethod || finalizing} onClick={() => void finalizeOrder()}>{finalizing ? "Registrando venda…" : "Confirmar venda e fechar"}</button><button type="button" className="proto-subtle" disabled={finalizing} onClick={() => setFinalizingOrder(null)}>Cancelar</button></div></section></div>}
    {detailOrder && <ActionModal title="Detalhes do pedido" subtitle="Confira os itens e os dados da comanda sem perder a visão do quadro." onClose={() => setExpandedOrderId(null)}><div className="order-detail-content"><dl className="proto-facts"><div><dt>Cliente</dt><dd>{detailOrder.customerName || detailOrder.customer?.name || "Não informado"}</dd></div><div><dt>Origem</dt><dd>{detailOrder.source === "whatsapp" ? "WhatsApp" : detailOrder.source === "scheduled" ? "Agendado" : "Balcão"}</dd></div><div><dt>Entrega</dt><dd>{detailOrder.fulfillment === "delivery" ? detailOrder.deliveryAddress || "Endereço pendente" : "Retirada na loja"}</dd></div><div><dt>Pagamento</dt><dd>{detailOrder.paymentMethod || "Pendente"}</dd></div><div><dt>Total atual</dt><dd>{formatOrderTotal(detailOrder)}</dd></div></dl><section className="order-detail-items"><strong>Itens do pedido</strong>{detailOrder.items.map(item => <div key={item.id}><span>{item.quantity} × {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</span><small>{item.isGift ? "Brinde" : "Item"}</small></div>)}</section><div className="proto-toolbar"><button type="button" onClick={() => openFinalization(detailOrder)}>Finalizar pedido</button><button type="button" className="proto-subtle" onClick={() => setExpandedOrderId(null)}>Fechar</button></div></div></ActionModal>}
  </div>;
}
