import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Boxes, Check, ChefHat, PackagePlus, Play, ShoppingCart, Trash2, Wand2, X } from "lucide-react";
import { assistantConfirmBatch, assistantPreview, createFoodOrder, createFoodProduct, getFoodProducts, registerCounterSale, registerFoodStock, type AssistantDraft, type AssistantRegistrationDraft, type AssistantRegistrationQuestion, type FoodProduct, type ProductInput, type SalePaymentMethod } from "@/lib/food-api";

const registrationWords = /\b(cadastre|cadastrar|cadastra|registre|registrar|registra|adicione|adicionar|adiciona)\b/i;
const unitLabel = (unit: AssistantRegistrationDraft["stockUnit"]) => unit === "g" ? "g" : unit === "ml" ? "ml" : "un";
type GuidedAction = "order" | "sale" | "stock" | "prepare" | "loss" | "register";
type GuidedStep = "menu" | "product" | "details" | "register";
type GuidedPayment = "pending" | SalePaymentMethod;
type RegistrationStep = "basic" | "source";

const guidedMoney = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const guidedNumber = (value: string) => Number(value.replace(",", "."));
const parseCents = (value: string) => {
  const parsed = Number(value.replace(/[^0-9,-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

function GuidedAssistant({ onUseFreeform }: { onUseFreeform: () => void }) {
  const [step, setStep] = useState<GuidedStep>("menu");
  const [action, setAction] = useState<GuidedAction | null>(null);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [quantity, setQuantity] = useState("");
  const [readyLossQuantity, setReadyLossQuantity] = useState("");
  const [unpreparedLossQuantity, setUnpreparedLossQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [payment, setPayment] = useState<GuidedPayment>("pending");
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [isGift, setIsGift] = useState(false);
  const [fryNow, setFryNow] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [registrationMode, setRegistrationMode] = useState<FoodProduct["productionMode"]>("resale");
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>("basic");
  const [registrationName, setRegistrationName] = useState("");
  const [registrationFlavor, setRegistrationFlavor] = useState("");
  const [registrationPrice, setRegistrationPrice] = useState("");
  const [registrationStock, setRegistrationStock] = useState("0");
  const [registrationRecipe, setRegistrationRecipe] = useState<FoodProduct["recipe"]>([]);
  const [registrationAllowOnDemand, setRegistrationAllowOnDemand] = useState(false);
  const [showIngredientForm, setShowIngredientForm] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientStock, setNewIngredientStock] = useState("0");
  const [creatingIngredient, setCreatingIngredient] = useState(false);

  const loadProducts = async (nextAction: GuidedAction) => {
    setLoading(true);
    setError("");
    try {
      const loaded = await getFoodProducts({ activeOnly: true });
      const available = nextAction === "order"
        ? loaded.filter(item => item.productionMode !== "ingredient" && (item.stockQuantity > 0 || item.unpreparedQuantity > 0 || (item.allowOnDemand && (item.preparationCapacity > 0 || item.saleCapacity > 0))))
        : nextAction === "sale" || nextAction === "prepare"
          ? loaded.filter(item => item.productionMode !== "ingredient")
          : loaded;
      setProducts(available);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os produtos.");
    } finally {
      setLoading(false);
    }
  };

  const chooseAction = (nextAction: GuidedAction) => {
    setResult("");
    setError("");
    setAction(nextAction);
    setSearch("");
    setProduct(null);
    setQuantity("");
    setReadyLossQuantity("");
    setUnpreparedLossQuantity("");
    setPrice("");
    setPayment("pending");
    setAdjustment("");
    setAdjustmentNote("");
    setIsGift(false);
    setFryNow(false);
    setRegistrationMode("resale");
    setRegistrationStep("basic");
    setRegistrationName("");
    setRegistrationFlavor("");
    setRegistrationPrice("");
    setRegistrationStock("0");
    setRegistrationRecipe([]);
    setRegistrationAllowOnDemand(false);
    setShowIngredientForm(false);
    setNewIngredientName("");
    setNewIngredientStock("0");
    if (nextAction === "register") {
      setStep("register");
      void loadProducts(nextAction);
      return;
    }
    setStep("product");
    void loadProducts(nextAction);
  };

  const chooseProduct = (nextProduct: FoodProduct) => {
    setProduct(nextProduct);
    setQuantity("");
    setReadyLossQuantity("");
    setUnpreparedLossQuantity("");
    setError("");
    setResult("");
    setAdjustment("");
    setAdjustmentNote("");
    setIsGift(false);
    setFryNow(action === "order" && nextProduct.stockQuantity <= 0 && (nextProduct.unpreparedQuantity > 0 || nextProduct.preparationCapacity > 0));
    if (action === "sale") setPrice(nextProduct.salePriceCents > 0 ? (nextProduct.salePriceCents / 100).toFixed(2).replace(".", ",") : "");
    if (action === "stock" || action === "prepare") {
      setStep("details");
      return;
    }
    setStep("details");
  };

  const resetToMenu = () => {
    setStep("menu");
    setAction(null);
    setProduct(null);
    setQuantity("");
    setReadyLossQuantity("");
    setUnpreparedLossQuantity("");
    setPrice("");
    setPayment("pending");
    setAdjustment("");
    setAdjustmentNote("");
    setIsGift(false);
    setFryNow(false);
    setSearch("");
    setError("");
    setRegistrationStep("basic");
  };

  const goBack = () => {
    if (step === "menu") return;
    if (step === "register") {
      const previous: Record<RegistrationStep, RegistrationStep | null> = { basic: null, source: "basic" };
      const previousStep = previous[registrationStep];
      if (previousStep) setRegistrationStep(previousStep);
      else resetToMenu();
      return;
    }
    if (step === "product") { resetToMenu(); return; }
    setStep("product");
  };

  const saveOperation = async () => {
    if (!product || !action || saving) return;
    const parsedQuantity = guidedNumber(quantity);
    const splitLoss = action === "loss" && product.productionMode !== "ingredient";
    const parsedReadyLoss = guidedNumber(readyLossQuantity || "0");
    const parsedUnpreparedLoss = guidedNumber(unpreparedLossQuantity || "0");
    if (splitLoss && (!Number.isInteger(parsedReadyLoss) || parsedReadyLoss < 0 || !Number.isInteger(parsedUnpreparedLoss) || parsedUnpreparedLoss < 0 || parsedReadyLoss + parsedUnpreparedLoss <= 0)) {
      setError("Informe quanto será retirado do estoque pronto e/ou do estoque para preparar.");
      return;
    }
    if (splitLoss && (parsedReadyLoss > product.stockQuantity || parsedUnpreparedLoss > product.unpreparedQuantity)) {
      setError(`Confira os limites: há ${product.stockQuantity} prontos e ${product.unpreparedQuantity} para preparar.`);
      return;
    }
    if (!splitLoss && (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0)) {
      setError("Informe uma quantidade inteira maior que zero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (action === "order") {
        const adjustmentCents = parseCents(adjustment);
        if ((adjustmentCents !== 0 || isGift) && !adjustmentNote.trim()) {
          setError("Informe o motivo do ajuste ou do brinde.");
          return;
        }
        const unitPriceCents = isGift ? 0 : product.salePriceCents + adjustmentCents;
        if (unitPriceCents < 0) {
          setError("O preço final não pode ser negativo.");
          return;
        }
        const order = await createFoodOrder({ source: "balcao", fulfillment: "pickup", items: [{ productId: product.id, quantity: parsedQuantity, unitPriceCents, fryNow, adjustmentCents, adjustmentNote: adjustmentNote.trim() || null, isGift }] });
        setResult(`Pedido #${order.id.slice(0, 8)} criado em Recebido.`);
        window.dispatchEvent(new Event("food-open-orders"));
      } else if (action === "sale") {
        const parsedPrice = price.trim() ? guidedNumber(price) : product.salePriceCents / 100;
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          setError("Informe um preço válido por unidade.");
          return;
        }
        if (isGift && !adjustmentNote.trim()) {
          setError("Informe o motivo do brinde.");
          return;
        }
        const unitPriceCents = isGift ? 0 : Math.round(parsedPrice * 100);
        await registerCounterSale({ operationId: crypto.randomUUID(), paymentMethod: payment === "pending" ? null : payment, items: [{ productId: product.id, quantity: parsedQuantity, unitPriceCents, adjustmentNote: isGift ? adjustmentNote.trim() : null, isGift }] });
        setResult(`${parsedQuantity} × ${product.name} vendido${parsedQuantity === 1 ? "" : "s"} por ${guidedMoney(unitPriceCents * parsedQuantity)}.`);
      } else {
        if (splitLoss) {
          await registerFoodStock(product.id, { operationId: crypto.randomUUID(), action: "loss_split", readyQuantity: parsedReadyLoss, unpreparedQuantity: parsedUnpreparedLoss });
          setResult(`${parsedReadyLoss} prontos e ${parsedUnpreparedLoss} para preparar foram baixados como perda.`);
        } else {
        const stockAction = action === "loss"
          ? "loss"
          : action === "prepare"
            ? "prepare"
            : product.productionMode === "ingredient"
              ? "receive_ready"
              : "receive_unprepared";
        await registerFoodStock(product.id, { operationId: crypto.randomUUID(), action: stockAction, quantity: parsedQuantity });
        const label = stockAction === "loss" ? "baixado como perda" : stockAction === "prepare" ? "preparado e ficou pronto" : stockAction === "receive_unprepared" ? "adicionado para preparar" : "adicionado ao estoque";
        setResult(`${parsedQuantity} × ${product.name} foi ${label}.`);
        }
      }
      window.dispatchEvent(new Event("food-stock-changed"));
      if (action === "register") {
        resetToMenu();
      } else {
        setProduct(null);
        setQuantity("");
        setReadyLossQuantity("");
        setUnpreparedLossQuantity("");
        setPrice("");
        setPayment("pending");
        setSearch("");
        setStep("product");
        await loadProducts(action);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a operação.");
    } finally {
      setSaving(false);
    }
  };

  const saveRegistration = async () => {
    if (saving) return;
    if (!registrationName.trim()) {
      setError("Informe o nome do produto.");
      return;
    }
    const parsedPrice = registrationPrice.trim() ? guidedNumber(registrationPrice) : 0;
    const parsedStock = guidedNumber(registrationStock);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedStock) || parsedStock < 0) {
      setError("Confira preço e quantidades. Use números inteiros para o estoque.");
      return;
    }
    const incompleteRecipe = registrationRecipe.some(row => !row.ingredientId);
    const invalidRecipeYield = registrationRecipe.some(row => !Number.isInteger(row.quantity) || row.quantity <= 0);
    const duplicatedRecipe = new Set(registrationRecipe.map(row => row.ingredientId)).size !== registrationRecipe.length;
    if (registrationMode === "recipe" && (incompleteRecipe || invalidRecipeYield || duplicatedRecipe)) {
      setError("Corrija os insumos e informe quantos produtos rendem por unidade de cada um.");
      return;
    }
    const input: ProductInput = {
      productionMode: registrationMode,
      stockUnit: "un",
      unitWeightGrams: null,
      unitVolumeMl: null,
      recipe: registrationMode === "recipe" ? registrationRecipe : [],
      unpreparedQuantity: registrationMode === "resale" ? parsedStock : 0,
      name: [registrationName.trim(), registrationFlavor.trim()].filter(Boolean).join(" · "),
      productName: registrationName.trim(),
      flavor: registrationFlavor.trim() || null,
      category: "Geral",
      aliases: [],
      variants: [],
      salePriceCents: Math.round(parsedPrice * 100),
      stockQuantity: registrationMode === "resale" ? 0 : parsedStock,
      allowOnDemand: registrationMode !== "ingredient" && registrationAllowOnDemand,
      fryToOrder: false,
      active: true,
    };
    setSaving(true);
    setError("");
    try {
      await createFoodProduct(input);
      setResult(`${input.name} foi cadastrado. Você pode completar a receita depois, se necessário.`);
      window.dispatchEvent(new Event("food-stock-changed"));
      resetToMenu();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o produto.");
    } finally {
      setSaving(false);
    }
  };

  const saveInlineIngredient = async () => {
    const name = newIngredientName.trim();
    const stock = guidedNumber(newIngredientStock || "0");
    if (!name) {
      setError("Informe o nome do insumo.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError("Informe uma quantidade inicial inteira para o insumo.");
      return;
    }
    setCreatingIngredient(true);
    setError("");
    try {
      const ingredient = await createFoodProduct({
        productionMode: "ingredient",
        stockUnit: "un",
        unitWeightGrams: null,
        unitVolumeMl: null,
        recipe: [],
        unpreparedQuantity: 0,
        name,
        productName: name,
        flavor: null,
        category: "Insumos",
        aliases: [],
        variants: [],
        salePriceCents: 0,
        stockQuantity: stock,
        allowOnDemand: false,
        fryToOrder: false,
        active: true,
      });
      setProducts(current => [...current, ingredient]);
      setRegistrationRecipe(current => {
        const emptyIndex = current.findIndex(row => !row.ingredientId);
        if (emptyIndex < 0) return [...current, { ingredientId: ingredient.id, quantity: 1 }];
        return current.map((row, index) => index === emptyIndex ? { ...row, ingredientId: ingredient.id } : row);
      });
      setNewIngredientName("");
      setNewIngredientStock("0");
      setShowIngredientForm(false);
      setResult(`${ingredient.name} foi cadastrado e anexado à receita.`);
      window.dispatchEvent(new Event("food-stock-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o insumo.");
    } finally {
      setCreatingIngredient(false);
    }
  };

  const continueRegistration = () => {
    setError("");
    if (registrationStep === "basic") {
      const parsedPrice = registrationPrice.trim() ? guidedNumber(registrationPrice) : 0;
      if (!registrationName.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
        setError("Informe o nome e um preço válido ou deixe o preço em branco.");
        return;
      }
      setRegistrationStep("source");
      return;
    }
  };

  const filteredProducts = products.filter(item => `${item.name} ${item.familyName} ${item.category} ${item.aliases.join(" ")}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const registrationIngredients = products.filter(item => item.productionMode === "ingredient" && item.active);
  const actionTitle = action === "order" ? "Novo pedido" : action === "sale" ? "Nova venda" : action === "stock" ? "Adicionar ao estoque" : action === "prepare" ? "Preparar" : action === "loss" ? "Dar baixa como perda" : "Preparo";
  const flowStep = step === "product" ? 1 : step === "details" ? 2 : registrationStep === "basic" ? 1 : 2;
  const flowLabels = action === "register" ? ["Dados", "Origem e configuração"] : ["Produto", "Quantidade e confirmação"];

  return <div className="food-assistant-guided">
    {step !== "menu" && <button type="button" className="food-assistant-back proto-subtle" onClick={goBack} disabled={loading || saving}><ArrowLeft size={16} /> Voltar</button>}
    {step !== "menu" && <div className="food-assistant-flow" aria-label={`Etapa ${flowStep} de ${flowLabels.length}`}><span className="food-assistant-flow-count">Etapa {flowStep} de {flowLabels.length}</span>{flowLabels.map((label, index) => <span className={index + 1 === flowStep ? "is-current" : index + 1 < flowStep ? "is-done" : ""} key={label}>{index + 1}. {label}</span>)}</div>}
    {result && step !== "menu" && <p className="food-assistant-success" role="status"><Check size={17} /> {result}</p>}
    {step === "menu" && <>
      <div className="food-assistant-intro"><strong>O que você quer fazer agora?</strong><span>Eu vou conduzir você passo a passo. Nada é registrado sem sua confirmação.</span></div>
      <div className="food-assistant-guided-menu">
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("order")}><ShoppingCart size={22} /><span><strong>Criar um pedido</strong><small>Enviar para Recebido e acompanhar até a finalização.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("sale")}><ShoppingCart size={22} /><span><strong>Registrar uma venda</strong><small>Escolher o item, quantidade, preço e pagamento.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("stock")}><Boxes size={22} /><span><strong>Adicionar ao estoque</strong><small>Receber insumos ou itens que serão preparados.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("prepare")}><ChefHat size={22} /><span><strong>Preparar</strong><small>Transformar itens separados em unidades prontas.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("loss")}><Trash2 size={22} /><span><strong>Dar baixa como perda</strong><small>Retirar produtos vencidos, estragados ou que não podem ficar para amanhã.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("register")}><PackagePlus size={22} /><span><strong>Cadastrar um produto</strong><small>Fazer o cadastro aqui, sem sair do assistente.</small></span></button>
      </div>
      {result && <p className="food-assistant-success" role="status"><Check size={17} /> {result}</p>}
      <div className="food-assistant-guided-footer"><span>Quer registrar outra ação por texto?</span><button type="button" className="proto-subtle" onClick={onUseFreeform}>Escrever uma ação</button></div>
    </>}
    {step === "product" && <>
      <div className="food-assistant-step-heading"><strong>{actionTitle}</strong><span>1. Escolha o produto</span></div>
      <label className="food-assistant-search">Buscar produto<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Digite o nome…" autoFocus /></label>
      {loading && <p className="proto-empty">Carregando produtos…</p>}
      {!loading && <div className="food-assistant-guided-products">{filteredProducts.map(item => <div className="food-assistant-guided-product-row" key={item.id}><button type="button" className="food-assistant-guided-product-main" onClick={() => chooseProduct(item)}><span><strong>{item.name}</strong><small>{item.stockQuantity > 0 ? `${item.stockQuantity} prontos` : "Sem estoque pronto"}{item.unpreparedQuantity > 0 ? ` · ${item.unpreparedQuantity} para preparar` : ""}</small>{item.ingredientDependencies.some(dependency => !dependency.available) && <small className="food-stock-warning">Faltam insumos: {item.ingredientDependencies.filter(dependency => !dependency.available).map(dependency => dependency.name).join(", ")}</small>}</span>{action === "sale" && <b>{item.salePriceCents > 0 ? guidedMoney(item.salePriceCents) : "Sem preço"}</b>}</button></div>)}</div>}
      {!loading && !filteredProducts.length && <p className="proto-empty">Nenhum produto encontrado.</p>}
    </>}
    {step === "details" && product && action && <>
      <div className="food-assistant-step-heading"><strong>{product.name}</strong><span>{action === "sale" ? "2. Informe os detalhes da venda" : action === "prepare" ? "2. Quantas unidades ficaram prontas?" : action === "stock" && product.productionMode !== "ingredient" ? "2. Quantas unidades chegaram para preparar?" : "2. Informe a quantidade"}</span></div>
      <div className="food-assistant-guided-fields">
        {action === "loss" && product.productionMode !== "ingredient" ? <><label>Prontos para venda<input autoFocus type="number" min="0" step="1" inputMode="numeric" value={readyLossQuantity} onChange={event => setReadyLossQuantity(event.target.value)} placeholder={`Ex.: ${product.stockQuantity}`} /><small>Disponíveis: {product.stockQuantity}</small></label><label>Para preparar<input type="number" min="0" step="1" inputMode="numeric" value={unpreparedLossQuantity} onChange={event => setUnpreparedLossQuantity(event.target.value)} placeholder={`Ex.: ${product.unpreparedQuantity}`} /><small>Disponíveis: {product.unpreparedQuantity}</small></label></> : <label>Quantidade<input autoFocus type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ex.: 10" /></label>}
        {action === "sale" && <><label>Preço por unidade (R$)<input type="text" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="Opcional" /></label><label>Pagamento<select value={payment} onChange={event => setPayment(event.target.value as GuidedPayment)}><option value="pending">Pendente / não informado</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option></select></label><label className="proto-switch"><span>Lançar como brinde (valor zero)</span><input type="checkbox" checked={isGift} onChange={event => setIsGift(event.target.checked)} /></label>{isGift && <label>Justificativa do brinde<input required value={adjustmentNote} onChange={event => setAdjustmentNote(event.target.value)} placeholder="Ex.: cortesia para cliente" /></label>}</>}
        {action === "order" && <><label>Ajuste de valor (R$)<input inputMode="decimal" value={adjustment} onChange={event => setAdjustment(event.target.value)} placeholder="Ex.: 2,00 ou -1,00" /></label>{(parseCents(adjustment) !== 0 || isGift) && <label>Justificativa<input required value={adjustmentNote} onChange={event => setAdjustmentNote(event.target.value)} placeholder="Ex.: acrescentou queijo" /></label>}<label className={`proto-switch food-assistant-prep-switch${fryNow ? " is-active" : ""}`}><span>Preparar este item{fryNow && product.stockQuantity <= 0 ? " · ativado automaticamente" : ""}<small>{fryNow ? "Será fritado/assado antes de finalizar." : "Usará uma unidade já pronta."}</small></span><input type="checkbox" checked={fryNow} onChange={event => setFryNow(event.target.checked)} /></label><label className="proto-switch"><span>Lançar como brinde (valor zero)</span><input type="checkbox" checked={isGift} onChange={event => setIsGift(event.target.checked)} /></label></>}
      </div>
      {action === "stock" && product.productionMode !== "ingredient" && <small className="food-assistant-operation-help">A entrada ficará separada como “para preparar”. Depois use “Preparar” para informar quantas ficaram prontas.</small>}
      {action === "prepare" && <small className="food-assistant-operation-help">Essa quantidade será retirada do estoque separado e adicionada ao estoque pronto.</small>}
      <div className="food-assistant-confirm-box"><strong>Confira antes de confirmar</strong>{action === "loss" && product.productionMode !== "ingredient" ? <><span>{readyLossQuantity || "0"} prontos para venda</span><span>{unpreparedLossQuantity || "0"} para preparar</span></> : <span>{quantity || "0"} × {product.name}</span>}{action === "order" && <span>Vai para Pedidos · Recebido</span>}{action === "sale" && <span>{price ? `${price} por unidade` : product.salePriceCents > 0 ? `${guidedMoney(product.salePriceCents)} por unidade` : "Preço não informado"}</span>}{action === "stock" && <span>{product.productionMode === "ingredient" ? "Entrada no estoque" : "Para preparar"}</span>}{action === "prepare" && <span>Preparado e pronto para venda</span>}{action === "loss" && <span>Baixar como perda</span>}</div>
      <button type="button" className="food-assistant-confirm" disabled={saving} onClick={() => void saveOperation()}>{saving ? "Salvando…" : "Confirmar operação"}</button>
    </>}
    {step === "register" && <form className="food-assistant-register-form" onSubmit={event => { event.preventDefault(); void saveRegistration(); }}>
      <div className="food-assistant-step-heading"><strong>Cadastrar produto</strong><span>{registrationStep === "basic" ? "Primeiro informe os dados principais." : "Agora me diga como este item chega ou é produzido."}</span></div>
      {registrationStep === "basic" && <>
        <div className="food-assistant-register-grid food-assistant-basic-grid"><label>Nome do produto<input required autoFocus value={registrationName} onChange={event => setRegistrationName(event.target.value)} placeholder="Ex.: Esfirra" /></label><label>Sabor <small>(opcional)</small><input value={registrationFlavor} onChange={event => setRegistrationFlavor(event.target.value)} placeholder="Ex.: Carne; deixe vazio para pão" /></label><label>Preço de venda (R$)<input inputMode="decimal" value={registrationPrice} onChange={event => setRegistrationPrice(event.target.value)} placeholder="Opcional" /></label></div>
        <button type="button" className="food-assistant-confirm" onClick={continueRegistration}>Continuar</button>
      </>}
      {registrationStep === "source" && <>
        <fieldset className="food-assistant-register-modes"><legend>Como este item chega até a loja?</legend><div className="food-assistant-register-mode-grid">
          <button type="button" className={registrationMode === "ingredient" ? "is-selected" : ""} onClick={() => setRegistrationMode("ingredient")}><strong>É um insumo</strong><small>Farinha, presunto, óleo ou item usado em receitas.</small></button>
          <button type="button" className={registrationMode === "resale" ? "is-selected" : ""} onClick={() => { setRegistrationMode("resale"); setRegistrationAllowOnDemand(false); }}><strong>Compro para preparar</strong><small>Recebo cru ou congelado e informo apenas quantas unidades chegaram.</small></button>
          <button type="button" className={registrationMode === "recipe" ? "is-selected" : ""} onClick={() => { setRegistrationMode("recipe"); setRegistrationAllowOnDemand(true); }}><strong>Faço aqui com insumos</strong><small>Escolho os insumos e informo quantos produtos cada unidade deles rende.</small></button>
        </div></fieldset>
        {registrationMode === "ingredient" && <section className="food-assistant-register-section"><strong>Estoque inicial (unidades) <small>(opcional)</small></strong><small>Cadastre o que você conta no dia a dia: 1 pacote, 1 peça, 1 garrafa, 1 bandeja etc. Não precisa pesar.</small><div className="food-assistant-register-grid"><label>Quantidade inicial<input type="number" min="0" step="1" value={registrationStock} onChange={event => setRegistrationStock(event.target.value)} placeholder="Ex.: 5" /></label></div></section>}
        {registrationMode === "resale" && <section className="food-assistant-register-section"><strong>Quantidade inicial para preparar <small>(opcional)</small></strong><div className="food-assistant-register-grid"><label>Unidades para preparar<input type="number" min="0" step="1" value={registrationStock} onChange={event => setRegistrationStock(event.target.value)} /></label></div><small>Essas unidades ficam separadas até você registrar que foram preparadas.</small></section>}
        {registrationMode === "recipe" && <section className="food-assistant-register-section"><strong>Estoque inicial</strong><small>A produção será registrada depois, quando você informar que preparou as unidades.</small></section>}
        {registrationMode === "recipe" && <details className="food-assistant-register-details" open><summary>Insumos e rendimento</summary><small>Escolha cada insumo e informe aproximadamente quantos produtos você consegue fazer com 1 unidade dele. Ex.: 1 pacote de mortadela rende 20 pães.</small>{registrationRecipe.map((row, index) => <div className="food-assistant-register-recipe-row" key={index}><label>Insumo<select required value={row.ingredientId} onChange={event => setRegistrationRecipe(current => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, ingredientId: event.target.value } : entry))}><option value="">Escolha…</option>{registrationIngredients.map(ingredient => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.stockQuantity} unidades)</option>)}</select></label><label>Produtos por 1 unidade<input required type="number" min="1" step="1" value={row.quantity} onChange={event => setRegistrationRecipe(current => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: Number(event.target.value) || 0 } : entry))} placeholder="Ex.: 20" /><small>Rendimento aproximado</small></label><button type="button" className="proto-subtle" onClick={() => setRegistrationRecipe(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remover</button></div>)}<button type="button" className="food-assistant-add-row" onClick={() => registrationIngredients.length ? setRegistrationRecipe(current => [...current, { ingredientId: "", quantity: 1 }]) : setShowIngredientForm(true)}>Adicionar insumo</button>{!registrationIngredients.length && <small>Nenhum insumo cadastrado. Clique em “Adicionar insumo” para criar um agora, sem sair deste cadastro.</small>}{showIngredientForm && <div className="food-assistant-inline-ingredient"><strong>Novo insumo</strong><label>Nome<input autoFocus value={newIngredientName} onChange={event => setNewIngredientName(event.target.value)} placeholder="Ex.: Leite" /></label><label>Quantidade inicial (unidades)<input type="number" min="0" step="1" value={newIngredientStock} onChange={event => setNewIngredientStock(event.target.value)} placeholder="Ex.: 1" /></label><div className="proto-toolbar"><button type="button" disabled={creatingIngredient} onClick={() => void saveInlineIngredient()}>{creatingIngredient ? "Salvando…" : "Cadastrar e anexar"}</button><button type="button" className="proto-subtle" disabled={creatingIngredient} onClick={() => setShowIngredientForm(false)}>Cancelar</button></div></div>}</details>}
        {registrationMode !== "ingredient" && <div className="food-assistant-register-checks"><label><input type="checkbox" checked={registrationAllowOnDemand} onChange={event => setRegistrationAllowOnDemand(event.target.checked)} /> Aceitar preparo sob demanda</label></div>}
        <div className="food-assistant-review"><strong>Resumo</strong><span><b>Produto:</b> {[registrationName, registrationFlavor].filter(Boolean).join(" · ")}</span><span><b>Origem:</b> {registrationMode === "ingredient" ? "Insumo contado por unidade" : registrationMode === "recipe" ? "Feito aqui com insumos" : "Comprado para preparar"}</span><span><b>Preço:</b> {registrationPrice || "não informado"}</span></div>
        <button type="submit" className="food-assistant-confirm" disabled={saving}>{saving ? "Salvando…" : "Confirmar e salvar cadastro"}</button>
      </>}
    </form>}
    {error && <p role="alert" className="food-assistant-error">{error}</p>}
  </div>;
}

export function FoodAssistant() {
  const [open, setOpen] = useState(false);
  const [guided, setGuided] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Escreva uma ou várias ações. Você confere tudo antes de registrar.");
  const [drafts, setDrafts] = useState<AssistantDraft[]>([]);
  const [registration, setRegistration] = useState<AssistantRegistrationDraft | null>(null);
  const [pendingRegistrationQuestion, setPendingRegistrationQuestion] = useState<AssistantRegistrationQuestion | null>(null);
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<Record<string, string>>({});
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const show = () => { setOpen(true); setGuided(true); };
    window.addEventListener("food-open-assistant", show);
    return () => {
      window.removeEventListener("food-open-assistant", show);
    };
  }, []);
  async function interpret(nextText = text, productId?: string) {
    if (!nextText.trim()) return;
    const pending = pendingRegistrationQuestion;
    const commandText = pending && !registrationWords.test(nextText)
      ? pending.kind === "quantity"
        ? `cadastre ${nextText} de ${pending.name ?? ""}`
        : pending.kind === "unit"
          ? `cadastre ${pending.quantity ?? ""} ${nextText} de ${pending.name ?? ""}`
          : pending.quantity && pending.stockUnit
            ? `cadastre ${pending.quantity} ${unitLabel(pending.stockUnit)} de ${nextText}`
            : `cadastre ${nextText}`
      : nextText;
    setBusy(true); setDrafts([]); setChoices([]);
    setRegistration(null); setPendingRegistrationQuestion(null);
    try {
      const result = await assistantPreview(commandText, productId);
      const nextDrafts = result.drafts ?? (result.draft ? [result.draft] : []);
      if (nextDrafts.length) {
        setDrafts(nextDrafts);
        setTotals(Object.fromEntries(nextDrafts.map(draft => [draft.id, (draft.totalCents / 100).toFixed(2).replace(".", ",")] )));
        setPayments(Object.fromEntries(nextDrafts.map(draft => [draft.id, draft.paymentMethod ?? "pending"] )));
        const message = result.message ?? `${nextDrafts.length} operaç${nextDrafts.length === 1 ? "ão" : "ões"} encontrada${nextDrafts.length === 1 ? "" : "s"}. Confira antes de registrar.`;
        setNotice(message);
      } else if (result.registration) {
        setRegistration(result.registration);
        const message = `Confira o novo insumo: ${result.registration.quantity} ${unitLabel(result.registration.stockUnit)} de ${result.registration.name}.`;
        setNotice(message);
      } else {
        const message = result.message ?? "Não entendi. Pode falar de outro jeito?";
        setNotice(message);
        setChoices(result.choices ?? []);
        setPendingRegistrationQuestion(result.registrationQuestion ?? null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível interpretar.";
      setNotice(message);
    }
    finally { setBusy(false); }
  }
  async function confirm() {
    if ((!drafts.length && !registration) || busy) return;
    const confirmations = drafts.map(draft => {
      const value = draft.action === "sale" ? totals[draft.id] ?? "" : String(draft.totalCents / 100);
      const totalCents = Math.round(Number(value.replace(",", ".")) * 100);
      return { draftId: draft.id, totalCents, paymentMethod: draft.action === "sale" && payments[draft.id] !== "pending" ? payments[draft.id] as SalePaymentMethod : null };
    });
    if (confirmations.some(item => !Number.isSafeInteger(item.totalCents) || item.totalCents < 0)) { setNotice("Confira os valores das vendas."); return; }
    setBusy(true);
    try {
      const result = await assistantConfirmBatch(confirmations, registration ? [{ draftId: registration.id }] : []);
      setNotice(result.message); setDrafts([]); setRegistration(null); setPendingRegistrationQuestion(null); setText("");
      window.dispatchEvent(new Event("food-stock-changed"));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível registrar."); }
    finally { setBusy(false); }
  }
  function editTranscription() {
    setDrafts([]);
    setRegistration(null);
    setChoices([]);
    setNotice("Edite o texto abaixo e toque em Analisar texto novamente. Nada foi registrado ainda.");
    window.setTimeout(() => textArea.current?.focus(), 0);
  }
  const actionLabel = (action: AssistantDraft["action"]) => action === "order" ? "Pedido · Recebido" : action === "sale" ? "Venda" : action === "prepare" ? "Preparo / finalização" : action === "loss" ? "Perda / baixa" : action === "receive_unprepared" ? "Entrada para finalizar" : "Entrada pronta";
  const toggleAssistant = () => {
    setOpen(true);
    setGuided(true);
  };
  return <div className="food-assistant prototype">
    {open && <section className="proto-panel food-assistant-panel" aria-label="Assistente da loja">
      <header className="food-assistant-heading"><h2>Assistente da loja</h2><button type="button" className="proto-subtle" disabled={busy} aria-label="Fechar assistente" onClick={() => setOpen(false)}><X size={18} /></button></header>
      {guided ? <GuidedAssistant onUseFreeform={() => setGuided(false)} /> : <>
      <button type="button" className="food-assistant-back proto-subtle" onClick={() => setGuided(true)} disabled={busy}><ArrowLeft size={16} /> Voltar às opções</button>
      <p role="status">{notice}</p>
      <form onSubmit={event => { event.preventDefault(); void interpret(); }}>
        <label>Mensagem para o assistente<textarea ref={textArea} autoFocus rows={3} maxLength={3000} disabled={busy} value={text} placeholder="Ex.: vendi 50 pães e fritei 10 pastéis" onChange={event => { setText(event.target.value); setDrafts([]); setRegistration(null); setChoices([]); }} /><small>Escreva uma ou várias ações. Depois de analisar, eu mostro o que será feito antes de registrar.</small></label>
        <div className="proto-toolbar"><button type="submit" disabled={busy || !text.trim()}><Play size={18} /> Analisar texto</button></div>
      </form>
      {choices.length > 0 && <div className="food-assistant-choices"><strong>Escolha o produto</strong>{choices.map(choice => <button type="button" key={choice.id} disabled={busy} onClick={() => void interpret(text, choice.id)}>{choice.name}</button>)}</div>}
      {registration && <section className="food-assistant-drafts" aria-label="Novo insumo"><header><strong>Confira o novo insumo</strong><small>Ele será criado como insumo contado por unidade e já entrará no estoque.</small></header><article className="proto-ticket"><div><small>Cadastro de insumo</small><strong>{registration.quantity} {unitLabel(registration.stockUnit)} · {registration.name}</strong></div><small>Depois você poderá anexar este insumo a um produto e informar o rendimento aproximado.</small></article><div className="proto-toolbar"><button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Cadastrando…" : "Cadastrar insumo"}</button><button type="button" className="proto-subtle" disabled={busy} onClick={editTranscription}>Editar texto</button></div></section>}
      {drafts.length > 0 && <section className="food-assistant-drafts" aria-label="Operações encontradas"><header><strong>Confira antes de registrar</strong><small>{drafts.length} item{drafts.length === 1 ? "" : "s"} na mesma mensagem</small></header>{drafts.map(draft => <article className="proto-ticket" key={draft.id}><div><small>{actionLabel(draft.action)}</small><strong>{draft.quantity} × {draft.productName}</strong></div>{draft.action === "sale" && <><label>Total da venda (R$)<input disabled={busy} inputMode="decimal" value={totals[draft.id] ?? ""} onChange={event => setTotals(current => ({ ...current, [draft.id]: event.target.value }))} /></label><label>Pagamento<select disabled={busy} value={payments[draft.id] ?? "pending"} onChange={event => setPayments(current => ({ ...current, [draft.id]: event.target.value }))}><option value="pending">Pendente / não informado</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option></select></label></>}</article>)}<div className="proto-toolbar"><button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Registrando…" : `Registrar ${drafts.length} operação${drafts.length === 1 ? "" : "ões"}`}</button><button type="button" className="proto-subtle" disabled={busy} onClick={editTranscription}>Editar texto</button></div></section>}
      </>}
    </section>}
    <button type="button" className="food-assistant-toggle" aria-expanded={open} aria-label="Abrir assistente" onClick={toggleAssistant}><Wand2 aria-hidden="true" size={27} /><span>Abrir assistente</span></button>
  </div>;
}
