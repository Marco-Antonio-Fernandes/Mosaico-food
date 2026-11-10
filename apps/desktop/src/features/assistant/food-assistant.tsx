import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Boxes, Calculator, Check, ChefHat, MessageCircle, PackagePlus, Pencil, Play, Plus, ShoppingCart, Trash2, Wand2, X } from "lucide-react";
import { assistantConfirmBatch, assistantPreview, createFoodOrder, createFoodProduct, createFoodProducts, getCreditLedger, getFoodCashToday, getFoodProducts, registerCounterSale, registerFoodStock, updateFoodProduct, type AssistantDraft, type AssistantRegistrationDraft, type AssistantRegistrationQuestion, type CreditCustomerRecord, type FoodCostBreakdown, type FoodProduct, type FoodProductVariant, type ProductInput, type SalePaymentMethod, PRICE_ADJUSTMENT_REASONS } from "@/lib/food-api";
import { CreditCustomerPicker } from "@/components/shared/credit-customer-picker";
import { CostCalculator } from "@/features/prototype/cost-calculator";

const registrationWords = /\b(cadastre|cadastrar|cadastra|registre|registrar|registra|adicione|adicionar|adiciona)\b/i;
const unitLabel = (unit: AssistantRegistrationDraft["stockUnit"]) => unit === "g" ? "g" : unit === "ml" ? "ml" : "un";
const splitRegistrationFlavors = (value: string) => [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
const registrationFlavorKey = (flavor: string) => flavor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim() || "__sem_sabor__";
type GuidedAction = "order" | "sale" | "stock" | "prepare" | "loss" | "register" | "registerIngredient" | "edit";
type GuidedStep = "menu" | "product" | "details" | "register";
type GuidedPayment = "pending" | SalePaymentMethod;
type GuidedFulfillment = "pickup" | "delivery";
type RegistrationStep = "mode" | "basic" | "source";
type OrderAllocationItem = { product: FoodProduct; quantity: number; readyOptions: number; selectedReadyUnits: number[] };
type OrderAllocationDraft = { items: OrderAllocationItem[] };

const guidedMoney = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const guidedNumber = (value: string) => Number(value.replace(",", "."));
const parseCents = (value: string) => {
  const parsed = Number(value.replace(/[^0-9,-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

function GuidedAssistant({ editProductId, onEditHandled }: { editProductId: string | null; onEditHandled: () => void }) {
  const [step, setStep] = useState<GuidedStep>("menu");
  const [action, setAction] = useState<GuidedAction | null>(null);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [quantity, setQuantity] = useState("");
  const [readyLossQuantity, setReadyLossQuantity] = useState("");
  const [unpreparedLossQuantity, setUnpreparedLossQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [payment, setPayment] = useState<GuidedPayment>("pending");
  const [cashReceived, setCashReceived] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomerRecord[]>([]);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditCustomerId, setCreditCustomerId] = useState("");
  const [fryNow, setFryNow] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [fulfillment, setFulfillment] = useState<GuidedFulfillment>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [registrationMode, setRegistrationMode] = useState<"frozen" | "ready" | "made_here">("frozen");
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>("basic");
  const [registrationName, setRegistrationName] = useState("");
  const [registrationFlavorFields, setRegistrationFlavorFields] = useState<string[]>([""]);
  const [registrationFlavorStock, setRegistrationFlavorStock] = useState<Record<string, string>>({});
  const [registrationFlavorReady, setRegistrationFlavorReady] = useState<Record<string, string>>({});
  const [registrationCost, setRegistrationCost] = useState("");
  const [registrationCostBreakdown, setRegistrationCostBreakdown] = useState<FoodCostBreakdown | null>(null);
  const [registrationCostCalculatorOpen, setRegistrationCostCalculatorOpen] = useState(false);
  const [registrationPrice, setRegistrationPrice] = useState("");
  const [registrationStock, setRegistrationStock] = useState("0");
  const [registrationRecipe, setRegistrationRecipe] = useState<FoodProduct["recipe"]>([]);
  const [registrationAliases, setRegistrationAliases] = useState("");
  const [registrationVariants, setRegistrationVariants] = useState<FoodProductVariant[]>([]);
  const [registrationAllowOnDemand, setRegistrationAllowOnDemand] = useState(false);
  const [showIngredientForm, setShowIngredientForm] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientStock, setNewIngredientStock] = useState("0");
  const [newIngredientCost, setNewIngredientCost] = useState("");
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [familyOptions, setFamilyOptions] = useState<FoodProduct[] | null>(null);
  const [selectedOrderProducts, setSelectedOrderProducts] = useState<FoodProduct[]>([]);
  const [orderQuantities, setOrderQuantities] = useState<Record<string, string>>({});
  const [orderAdjustments, setOrderAdjustments] = useState<Record<string, string>>({});
  const [orderAdjustmentNotes, setOrderAdjustmentNotes] = useState<Record<string, string>>({});
  const [orderAllocationState, setOrderAllocation] = useState<OrderAllocationDraft | null>(null);
  const orderAllocation = orderAllocationState ?? { items: [] };
  const selectedOrderTotalCents = selectedOrderProducts.reduce((sum, selectedProduct) => {
    const quantity = guidedNumber(orderQuantities[selectedProduct.id] ?? "");
    return sum + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0) * selectedProduct.salePriceCents;
  }, 0);
  const enteredOrderCashCents = cashReceived.trim() ? parseCents(cashReceived) : selectedOrderTotalCents;
  const selectedOrderChangeCents = Math.max(0, enteredOrderCashCents - selectedOrderTotalCents);

  const loadProducts = async (nextAction: GuidedAction) => {
    setLoading(true);
    setError("");
    try {
      const loaded = await getFoodProducts({ activeOnly: true });
      const available = nextAction === "prepare"
        ? loaded.filter(item => item.productionMode !== "ingredient" && (item.productionMode === "made_here" || item.productionMode === "recipe" || item.unpreparedQuantity > 0))
        : nextAction === "order" || nextAction === "sale"
          ? loaded.filter(item => item.productionMode !== "ingredient")
          : nextAction === "edit"
            ? loaded.filter(item => item.productionMode !== "ingredient")
          : loaded;
      setProducts(available);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os produtos.");
    } finally {
      setLoading(false);
    }
  };

  const loadCreditCustomers = async () => {
    if (creditCustomers.length || creditLoading) return;
    setCreditLoading(true);
    try {
      const data = await getCreditLedger();
      setCreditCustomers(data.customers.filter(customer => customer.creditAccount));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes do crediário.");
    } finally {
      setCreditLoading(false);
    }
  };

  const changePayment = (nextPayment: GuidedPayment) => {
    setPayment(nextPayment);
    if (nextPayment !== "cash") setCashReceived("");
    if (nextPayment === "crediario") void loadCreditCustomers();
    else setCreditCustomerId("");
  };

  const chooseAction = (nextAction: GuidedAction) => {
    setResult("");
    setError("");
    setAction(nextAction);
    setSearch("");
    setProduct(null);
    setFamilyOptions(null);
    setSelectedOrderProducts([]);
    setOrderQuantities({});
    setOrderAdjustments({});
    setOrderAdjustmentNotes({});
    setQuantity("");
    setReadyLossQuantity("");
    setUnpreparedLossQuantity("");
    setPrice("");
    setPayment("pending");
    setCashReceived("");
    setAdjustment("");
    setAdjustmentNote("");
    setCreditCustomerId("");
    setFryNow(false);
    setCustomerName("");
    setFulfillment("pickup");
    setDeliveryAddress("");
    setRegistrationMode("frozen");
    setRegistrationStep("basic");
    setRegistrationName("");
    setRegistrationFlavorFields([""]);
    setRegistrationFlavorStock({});
    setRegistrationFlavorReady({});
    setRegistrationCost("");
    setRegistrationCostBreakdown(null);
    setRegistrationCostCalculatorOpen(false);
    setRegistrationPrice("");
    setRegistrationStock("0");
    setRegistrationRecipe([]);
    setRegistrationAliases("");
    setRegistrationVariants([]);
    setRegistrationAllowOnDemand(false);
    setShowIngredientForm(false);
    setNewIngredientName("");
    setNewIngredientStock("0");
    setNewIngredientCost("");
    setOrderAllocation(null);
    if (nextAction === "register" || nextAction === "registerIngredient") {
      setRegistrationStep(nextAction === "register" ? "mode" : "basic");
      setStep("register");
      if (nextAction === "register") void loadProducts(nextAction);
      return;
    }
    setStep("product");
    void loadProducts(nextAction);
  };

  const chooseProduct = (nextProduct: FoodProduct, actionOverride?: GuidedAction) => {
    const effectiveAction = actionOverride ?? action;
    setProduct(nextProduct);
    setFamilyOptions(null);
    setQuantity("");
    setReadyLossQuantity("");
    setUnpreparedLossQuantity("");
    setError("");
    setResult("");
    setAdjustment("");
    setAdjustmentNote("");
    setCreditCustomerId("");
    setFryNow(effectiveAction === "order" && nextProduct.stockQuantity <= 0 && (nextProduct.unpreparedQuantity > 0 || nextProduct.preparationCapacity > 0));
    setOrderAllocation(null);
    if (effectiveAction === "edit") {
      const currentFlavor = nextProduct.flavor ?? "";
      setRegistrationMode(nextProduct.productionMode === "made_here" || nextProduct.productionMode === "recipe" ? "made_here" : nextProduct.productionMode === "ready" ? "ready" : "frozen");
      setRegistrationStep("basic");
      setRegistrationName(nextProduct.productName || nextProduct.name);
      setRegistrationFlavorFields([currentFlavor]);
      setRegistrationFlavorStock({ [registrationFlavorKey(currentFlavor)]: String(nextProduct.productionMode === "resale" ? nextProduct.unpreparedQuantity : nextProduct.stockQuantity) });
      setRegistrationFlavorReady({ [registrationFlavorKey(currentFlavor)]: String(nextProduct.stockQuantity) });
      setRegistrationCost(nextProduct.costPriceCents > 0 ? (nextProduct.costPriceCents / 100).toFixed(2).replace(".", ",") : "");
      setRegistrationCostBreakdown(nextProduct.costBreakdown);
      setRegistrationCostCalculatorOpen(false);
      setRegistrationPrice(nextProduct.salePriceCents > 0 ? (nextProduct.salePriceCents / 100).toFixed(2).replace(".", ",") : "");
      setRegistrationRecipe(nextProduct.recipe.map(row => ({ ...row })));
      setRegistrationAliases(nextProduct.aliases.join(", "));
      setRegistrationVariants(nextProduct.variants.map(variant => ({ ...variant, aliases: [...variant.aliases] })));
      setRegistrationAllowOnDemand(nextProduct.allowOnDemand);
      setStep("register");
      return;
    }
    if (effectiveAction === "sale") setPrice(nextProduct.salePriceCents > 0 ? (nextProduct.salePriceCents / 100).toFixed(2).replace(".", ",") : "");
    if (effectiveAction === "stock" || effectiveAction === "prepare") {
      setStep("details");
      return;
    }
    setStep("details");
  };

  useEffect(() => {
    if (!editProductId) return;
    let active = true;
    void getFoodProducts().then(list => {
      if (!active) return;
      const found = list.find(item => item.id === editProductId);
      if (found) {
        setAction("edit");
        chooseProduct(found, "edit");
      }
      onEditHandled();
    }).catch(() => { if (active) onEditHandled(); });
    return () => { active = false; };
  }, [editProductId]);

  const toggleOrderProduct = (nextProduct: FoodProduct) => {
    setSelectedOrderProducts(current => current.some(item => item.id === nextProduct.id)
      ? current.filter(item => item.id !== nextProduct.id)
      : [...current, nextProduct]);
    setError("");
    setResult("");
  };

  const chooseFamily = (family: FoodProduct[]) => {
    if (action === "order" || action === "sale" || action === "prepare") {
      if (family.length === 1) {
        toggleOrderProduct(family[0]);
        return;
      }
      setFamilyOptions(family);
      setError("");
      setResult("");
      return;
    }
    if (family.length === 1) {
      chooseProduct(family[0]);
      return;
    }
    setFamilyOptions(family);
    setError("");
    setResult("");
  };

  const resetToMenu = () => {
    setStep("menu");
    setAction(null);
    setProduct(null);
    setFamilyOptions(null);
    setSelectedOrderProducts([]);
    setOrderQuantities({});
    setOrderAdjustments({});
    setOrderAdjustmentNotes({});
    setQuantity("");
    setReadyLossQuantity("");
    setUnpreparedLossQuantity("");
    setPrice("");
    setPayment("pending");
    setCashReceived("");
    setAdjustment("");
    setAdjustmentNote("");
    setFryNow(false);
    setCustomerName("");
    setFulfillment("pickup");
    setDeliveryAddress("");
    setOrderAllocation(null);
    setSearch("");
    setError("");
    setRegistrationStep("basic");
    setRegistrationCostBreakdown(null);
    setRegistrationCostCalculatorOpen(false);
  };

  const confirmOrderProductSelection = () => {
    if (!selectedOrderProducts.length) {
      setError("Selecione ao menos um produto ou sabor para a comanda.");
      return;
    }
    setOrderQuantities(current => Object.fromEntries(selectedOrderProducts.map(item => [item.id, current[item.id] ?? "1"])));
    setOrderAdjustments(current => Object.fromEntries(selectedOrderProducts.map(item => [item.id, current[item.id] ?? ""])));
    setOrderAdjustmentNotes(current => Object.fromEntries(selectedOrderProducts.map(item => [item.id, current[item.id] ?? ""])));
    setOrderAllocation({ items: selectedOrderProducts.map(product => ({ product, quantity: 1, readyOptions: product.stockQuantity, selectedReadyUnits: [] })) });
    setStep("details");
    setFamilyOptions(null);
    setError("");
  };

  const updateOrderQuantity = (productId: string, value: string) => {
    const quantity = Number(value);
    setOrderQuantities(current => ({ ...current, [productId]: value }));
    setOrderAllocation(current => current ? {
      ...current,
      items: current.items.map(item => item.product.id === productId
        ? { ...item, quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 0, selectedReadyUnits: item.selectedReadyUnits.slice(0, Math.max(0, quantity)) }
      : item),
    } : current);
  };

  const updateReadyUnits = (productId: string, selectedReadyUnits: number[]) => {
    setOrderAllocation(current => current ? {
      ...current,
      items: current.items.map(item => item.product.id === productId ? { ...item, selectedReadyUnits } : item),
    } : current);
  };

  const selectReadyUnits = (productId: string, quantity: number, stockQuantity: number) => {
    const amount = Math.min(Math.max(quantity, 0), stockQuantity);
    updateReadyUnits(productId, Array.from({ length: amount }, (_, index) => index));
  };

  const goBack = () => {
    if (step === "menu") return;
    if (step === "register") {
      if (action === "edit" && registrationStep === "basic") {
        setStep("product");
        setProduct(null);
        setError("");
        return;
      }
      const previousStep = registrationStep === "source"
        ? "basic"
        : registrationStep === "basic" && action === "register"
          ? "mode"
          : null;
      if (previousStep) setRegistrationStep(previousStep);
      else resetToMenu();
      return;
    }
    if (step === "product") {
      if (familyOptions) {
        setFamilyOptions(null);
        return;
      }
      resetToMenu();
      return;
    }
    setStep("product");
  };

  const saveOperation = async () => {
    if (!action || saving) return;
    if (action === "order") {
      if (!selectedOrderProducts.length) {
        setError("Selecione ao menos um produto ou sabor para a comanda.");
        return;
      }
      const lines = selectedOrderProducts.map(item => ({ product: item, quantity: guidedNumber(orderQuantities[item.id] ?? "") }));
      if (lines.some(line => !Number.isInteger(line.quantity) || line.quantity <= 0)) {
        setError("Informe uma quantidade inteira maior que zero para cada item.");
        return;
      }
      if (payment === "pending") {
        setError("Escolha a forma de pagamento para preparar a comanda.");
        return;
      }
      if (payment === "crediario" && !creditCustomerId) {
        setError("Selecione o cliente do crediário.");
        return;
      }
      const allocations = lines.map(({ product, quantity }) => {
        const readyQuantity = Math.min(product.stockQuantity, quantity);
        return {
          product,
          quantity,
          readyQuantity,
          prepareQuantity: quantity - readyQuantity,
          availableToPrepare: product.productionMode === "made_here" || product.productionMode === "recipe" ? product.preparationCapacity : product.unpreparedQuantity,
        };
      });
      const unavailable = allocations.find(item => item.prepareQuantity > item.availableToPrepare);
      if (unavailable) {
        setError(`Não há quantidade suficiente de ${unavailable.product.name} para este pedido.`);
        return;
      }
      const items = allocations.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPriceCents: item.product.salePriceCents,
        fryNow: item.prepareQuantity > 0,
        readyQuantity: item.readyQuantity,
        prepareQuantity: item.prepareQuantity,
        adjustmentCents: 0,
        adjustmentNote: null,
        isGift: false,
      }));
      const orderTotalCents = allocations.reduce((sum, item) => sum + item.quantity * item.product.salePriceCents, 0);
      const cashReceivedCents = payment === "cash" ? (cashReceived.trim() ? parseCents(cashReceived) : orderTotalCents) : null;
      if (payment === "cash" && cashReceivedCents !== null && cashReceivedCents < orderTotalCents) {
        setError(`O dinheiro entregue precisa ser pelo menos ${guidedMoney(orderTotalCents)}.`);
        return;
      }
      setSaving(true);
      setError("");
      try {
        const orderName = customerName.trim();
        const orderAddress = deliveryAddress.trim();
        if (fulfillment === "delivery" && !orderAddress) {
          setError("Informe o endereço para pedidos de entrega.");
          setSaving(false);
          return;
        }
        const order = await createFoodOrder({ source: "balcao", customerName: orderName || null, fulfillment, deliveryAddress: fulfillment === "delivery" ? orderAddress : null, paymentMethod: payment, cashReceivedCents, items });
        const readyTotal = allocations.reduce((sum, item) => sum + item.readyQuantity, 0);
        const prepareTotal = allocations.reduce((sum, item) => sum + item.prepareQuantity, 0);
        const changeLabel = payment === "cash" && order.cashChangeCents ? ` Troco: ${guidedMoney(order.cashChangeCents)}.` : "";
        setResult(`${orderName ? `Comanda de ${orderName}` : "Comanda"} criada em Recebido. Pagamento: ${payment === "pix" ? "Pix" : payment === "cash" ? "dinheiro" : payment === "card_credit" ? "cartão de crédito" : payment === "card_debit" ? "cartão de débito" : payment === "meal_voucher" ? "vale-alimentação" : "crediário"}.${changeLabel} ${readyTotal} pronta${readyTotal === 1 ? "" : "s"} e ${prepareTotal} para preparar.`);
        window.dispatchEvent(new Event("food-open-orders"));
        window.dispatchEvent(new Event("food-stock-changed"));
        setOrderAllocation(null); setSelectedOrderProducts([]); setOrderQuantities({}); setOrderAdjustments({}); setOrderAdjustmentNotes({}); setCashReceived(""); setCustomerName(""); setFulfillment("pickup"); setDeliveryAddress(""); setSearch(""); setStep("product");
        await loadProducts("order");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível criar o pedido.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (action === "sale" || action === "prepare") {
      if (!selectedOrderProducts.length) {
        setError("Selecione ao menos um produto ou sabor.");
        return;
      }
      const lines = selectedOrderProducts.map(item => ({ product: item, quantity: guidedNumber(orderQuantities[item.id] ?? "") }));
      if (lines.some(line => !Number.isInteger(line.quantity) || line.quantity <= 0)) {
        setError("Informe uma quantidade inteira maior que zero para cada item.");
        return;
      }
      if (action === "prepare") {
        const unavailable = lines.find(line => line.quantity > (line.product.productionMode === "made_here" || line.product.productionMode === "recipe" ? line.product.preparationCapacity : line.product.unpreparedQuantity));
        if (unavailable) {
          setError(`Não há quantidade suficiente para preparar ${unavailable.product.name}.`);
          return;
        }
      }
      if (action === "sale" && payment === "crediario" && !creditCustomerId) {
        setError("Selecione o cliente do crediário.");
        return;
      }
      if (action === "sale" && payment === "pending") {
        setError("Escolha a forma de pagamento antes de confirmar a venda.");
        return;
      }
      const isGiftSale = action === "sale" && payment === "brinde";
      const saleItems = action === "sale" ? lines.map(line => {
        const lineAdjustment = isGiftSale ? 0 : parseCents(orderAdjustments[line.product.id] ?? "");
        const lineNote = (orderAdjustmentNotes[line.product.id] ?? "").trim();
        const unitPriceCents = isGiftSale ? 0 : line.product.salePriceCents + lineAdjustment;
        return { productId: line.product.id, quantity: line.quantity, unitPriceCents, adjustmentCents: lineAdjustment, adjustmentNote: lineNote || null, isGift: isGiftSale };
      }) : [];
      if (saleItems.some(item => item.unitPriceCents < 0 || (item.isGift || item.adjustmentCents !== 0) && !item.adjustmentNote)) {
        setError("Confira os preços e informe a justificativa de cada alteração.");
        return;
      }
      setSaving(true);
      try {
        if (action === "sale") {
          const cash = await getFoodCashToday();
          if (!cash.session || cash.session.status !== "open") throw new Error("Abra o caixa antes de registrar uma venda.");
          const totalCents = saleItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
          await registerCounterSale({ operationId: crypto.randomUUID(), paymentMethod: payment as SalePaymentMethod, creditCustomerId: payment === "crediario" ? creditCustomerId : null, items: saleItems });
          setResult(`${lines.length} item${lines.length === 1 ? "" : "s"} vendido${lines.length === 1 ? "" : "s"} por ${guidedMoney(totalCents)}.`);
        } else {
          for (const line of lines) await registerFoodStock(line.product.id, { operationId: crypto.randomUUID(), action: "prepare", quantity: line.quantity });
          setResult(`${lines.length} item${lines.length === 1 ? "" : "s"} preparado${lines.length === 1 ? "" : "s"} e disponível${lines.length === 1 ? "" : "is"} para venda.`);
        }
        window.dispatchEvent(new Event("food-stock-changed"));
        setSelectedOrderProducts([]); setOrderQuantities({}); setOrderAdjustments({}); setOrderAdjustmentNotes({}); setProduct(null); setSearch(""); setStep("product");
        await loadProducts(action);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : action === "sale" ? "Não foi possível registrar a venda." : "Não foi possível registrar o preparo.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!product) return;
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
    setError("");
    setSaving(true);
    try {
      if (splitLoss) {
        await registerFoodStock(product.id, { operationId: crypto.randomUUID(), action: "loss_split", readyQuantity: parsedReadyLoss, unpreparedQuantity: parsedUnpreparedLoss });
        setResult(`${parsedReadyLoss} prontos e ${parsedUnpreparedLoss} para preparar foram baixados como perda.`);
      } else {
        const stockAction = action === "loss"
          ? "loss"
          : product.productionMode === "frozen" || product.productionMode === "resale"
            ? "receive_unprepared"
            : "receive_ready";
        await registerFoodStock(product.id, { operationId: crypto.randomUUID(), action: stockAction, quantity: parsedQuantity });
        const label = stockAction === "loss" ? "baixado como perda" : stockAction === "receive_unprepared" ? "adicionado para preparar" : "adicionado ao estoque";
        setResult(`${parsedQuantity} × ${product.name} foi ${label}.`);
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

  const confirmOrderAllocation = async () => {
    if (action !== "order" || !orderAllocation || saving) return;
    if (payment === "pending") {
      setError("Escolha a forma de pagamento antes de confirmar o pedido.");
      return;
    }
    if (payment === "crediario" && !creditCustomerId) {
      setError("Selecione o cliente do crediário antes de confirmar o pedido.");
      return;
    }
    const allocations = orderAllocation.items.map(item => ({
      ...item,
      readyQuantity: item.selectedReadyUnits.length,
      prepareQuantity: item.quantity - item.selectedReadyUnits.length,
      availableToPrepare: item.product.productionMode === "made_here" || item.product.productionMode === "recipe" ? item.product.preparationCapacity : item.product.unpreparedQuantity,
    }));
    const invalidAllocation = allocations.find(item => item.prepareQuantity > item.availableToPrepare);
    if (invalidAllocation) {
      setError(`Não há quantidade suficiente para preparar ${invalidAllocation.product.name}. Selecione mais unidades prontas.`);
      return;
    }
    const items = allocations.map(item => {
      return {
        productId: item.product.id,
        quantity: item.quantity,
        unitPriceCents: item.product.salePriceCents,
        fryNow: item.prepareQuantity > 0,
        readyQuantity: item.readyQuantity,
        prepareQuantity: item.prepareQuantity,
        adjustmentCents: 0,
        adjustmentNote: null,
        isGift: false,
      };
    });
    const orderTotalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const cashReceivedCents = payment === "cash" ? (cashReceived.trim() ? parseCents(cashReceived) : orderTotalCents) : null;
    if (payment === "cash" && cashReceivedCents !== null && cashReceivedCents < orderTotalCents) {
      setError(`O dinheiro entregue precisa ser pelo menos ${guidedMoney(orderTotalCents)}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const orderAddress = deliveryAddress.trim();
      if (fulfillment === "delivery" && !orderAddress) {
        setError("Informe o endereço para pedidos de entrega.");
        setSaving(false);
        return;
      }
      const order = await createFoodOrder({ source: "balcao", customerName: customerName.trim() || null, fulfillment, deliveryAddress: fulfillment === "delivery" ? orderAddress : null, paymentMethod: payment, cashReceivedCents, items });
      const readyTotal = allocations.reduce((sum, item) => sum + item.readyQuantity, 0);
      const prepareTotal = allocations.reduce((sum, item) => sum + item.prepareQuantity, 0);
      const changeLabel = payment === "cash" && order.cashChangeCents ? ` Troco: ${guidedMoney(order.cashChangeCents)}.` : "";
      setResult(`Pedido criado em Recebido com ${items.length} item${items.length === 1 ? "" : "s"}.${changeLabel} ${readyTotal} pronta${readyTotal === 1 ? "" : "s"} e ${prepareTotal} para preparar.`);
      window.dispatchEvent(new Event("food-open-orders"));
      window.dispatchEvent(new Event("food-stock-changed"));
      setOrderAllocation(null);
      setProduct(null);
      setSelectedOrderProducts([]);
      setOrderQuantities({});
      setOrderAdjustments({});
      setOrderAdjustmentNotes({});
      setCashReceived("");
      setCustomerName("");
      setFulfillment("pickup");
      setDeliveryAddress("");
      setQuantity("");
      setAdjustment("");
      setAdjustmentNote("");
      setSearch("");
      setStep("product");
      await loadProducts("order");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o pedido.");
    } finally {
      setSaving(false);
    }
  };

  const saveRegistration = async () => {
    if (saving) return;
    if (action === "registerIngredient") {
      const name = newIngredientName.trim();
      const stock = guidedNumber(newIngredientStock || "0");
      const cost = newIngredientCost.trim() ? guidedNumber(newIngredientCost) : 0;
      if (!name) {
        setError("Informe o nome do insumo.");
        return;
      }
      if (!Number.isInteger(stock) || stock < 0 || !Number.isFinite(cost) || cost < 0) {
        setError("Confira a quantidade inicial e o custo do insumo.");
        return;
      }
      setSaving(true);
      setError("");
      try {
        await createFoodProduct({
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
          costPriceCents: Math.round(cost * 100),
          salePriceCents: 0,
          stockQuantity: stock,
          allowOnDemand: false,
          fryToOrder: false,
          active: true,
        });
        setResult(`${name} foi cadastrado no estoque.`);
        window.dispatchEvent(new Event("food-stock-changed"));
        resetToMenu();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o insumo.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!registrationName.trim()) {
      setError("Informe o nome do produto.");
      return;
    }
    const parsedPrice = registrationPrice.trim() ? guidedNumber(registrationPrice) : 0;
    const flavorNames = [...new Set(registrationFlavorFields.flatMap(splitRegistrationFlavors))];
    const flavorsToCreate = action === "edit" ? [flavorNames[0] ?? ""] : flavorNames.length ? flavorNames : [""];
    const flavorStocks = flavorsToCreate.map(flavor => ({
      flavor,
      frozen: guidedNumber(registrationFlavorStock[registrationFlavorKey(flavor)] ?? "0"),
      ready: guidedNumber(registrationFlavorReady[registrationFlavorKey(flavor)] ?? "0"),
    }));
    const parsedCost = registrationCost.trim() ? guidedNumber(registrationCost) : 0;
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isFinite(parsedCost) || parsedCost < 0 || flavorStocks.some(item => !Number.isInteger(item.frozen) || item.frozen < 0 || !Number.isInteger(item.ready) || item.ready < 0)) {
      setError("Confira preço e quantidades. Use números inteiros para o estoque.");
      return;
    }
    const modeForSave = action === "edit" && product ? product.productionMode : registrationMode;
    const aliases = [...new Set(registrationAliases.split(",").map(alias => alias.trim()).filter(Boolean))];
    const variants = registrationVariants
      .map(variant => ({ ...variant, name: variant.name.trim(), aliases: [...new Set(variant.aliases.map(alias => alias.trim()).filter(Boolean))] }))
      .filter(variant => variant.name);
    const inputs: ProductInput[] = flavorStocks.map(({ flavor, frozen, ready }) => ({
      productionMode: modeForSave,
      stockUnit: action === "edit" && product ? product.stockUnit : "un",
      unitWeightGrams: action === "edit" && product ? product.unitWeightGrams : null,
      unitVolumeMl: action === "edit" && product ? product.unitVolumeMl : null,
      recipe: [],
      unpreparedQuantity: action === "edit" && product ? product.unpreparedQuantity : modeForSave === "frozen" ? frozen : 0,
      name: [registrationName.trim(), flavor].filter(Boolean).join(" · "),
      productName: registrationName.trim(),
      flavor: flavor || null,
      category: action === "edit" && product ? product.category : "Geral",
      aliases,
      variants,
      salePriceCents: Math.round(parsedPrice * 100),
      costPriceCents: Math.round(parsedCost * 100),
      costBreakdown: registrationCostBreakdown,
      stockQuantity: action === "edit" && product ? product.stockQuantity : ready,
      allowOnDemand: modeForSave === "made_here",
      fryToOrder: false,
      active: action === "edit" && product ? product.active : true,
      ...(action === "edit" && product ? {
        fiscalNcm: product.fiscalNcm,
        fiscalCest: product.fiscalCest,
        fiscalGtin: product.fiscalGtin,
        fiscalUnit: product.fiscalUnit,
        fiscalCfop: product.fiscalCfop,
        fiscalOrigin: product.fiscalOrigin,
        fiscalCst: product.fiscalCst,
        fiscalCsosn: product.fiscalCsosn,
        fiscalPisCst: product.fiscalPisCst,
        fiscalCofinsCst: product.fiscalCofinsCst,
        fiscalBenefitCode: product.fiscalBenefitCode,
      } : {}),
    }));
    setSaving(true);
    setError("");
    try {
      if (action === "edit" && product) {
        await updateFoodProduct(product.id, inputs[0]);
        setResult(`${registrationName.trim()} foi atualizado.`);
      } else {
        await createFoodProducts(inputs);
        setResult(`${registrationName.trim()} foi cadastrado com ${inputs.length} sabor${inputs.length === 1 ? "" : "es"} e estoque separado por sabor.`);
      }
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
        costPriceCents: 0,
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
    if (registrationStep === "mode") {
      setRegistrationStep("basic");
      return;
    }
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

  const filteredProducts = products.filter(item => `${item.name} ${item.familyName} ${item.productName} ${item.flavor ?? ""} ${item.category} ${item.aliases.join(" ")}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const productFamilies = Object.values(filteredProducts.reduce<Record<string, FoodProduct[]>>((groups, item) => {
    const key = item.productName || item.familyName || item.name;
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {}));
  const registrationIngredients = products.filter(item => item.productionMode === "ingredient" && item.active);
  const registrationFlavors = [...new Set(registrationFlavorFields.flatMap(splitRegistrationFlavors))];
  const registrationFlavorRows = registrationFlavors.length ? registrationFlavors : [""];
  const addRegistrationVariant = () => setRegistrationVariants(current => [...current, { id: crypto.randomUUID(), name: "", aliases: [], priceDeltaCents: 0 }]);
  const updateRegistrationVariant = (id: string, changes: Partial<FoodProductVariant>) => setRegistrationVariants(current => current.map(variant => variant.id === id ? { ...variant, ...changes } : variant));
  const removeRegistrationVariant = (id: string) => setRegistrationVariants(current => current.filter(variant => variant.id !== id));
  const chooseRegistrationMode = (mode: "frozen" | "ready" | "made_here") => {
    setRegistrationMode(mode);
  };
  const actionTitle = action === "order" ? "Novo pedido" : action === "sale" ? "Nova venda" : action === "stock" ? "Adicionar ao estoque" : action === "prepare" ? "Preparar" : action === "loss" ? "Dar baixa como perda" : action === "edit" ? "Editar produto" : action === "registerIngredient" ? "Cadastrar insumo" : "Preparo";
  const supportsMultipleSelection = action === "order" || action === "sale" || action === "prepare";
  const flowStep = step === "product" ? 1 : step === "details" ? 2 : action === "register" ? registrationStep === "mode" ? 1 : registrationStep === "basic" ? 2 : 3 : registrationStep === "basic" ? 1 : 2;
  const flowLabels = action === "register" ? ["Tipo", "Dados", "Estoque inicial"] : action === "registerIngredient" ? ["Dados"] : action === "edit" ? ["Dados", "Estoque inicial"] : ["Produto", "Quantidade e confirmação"];

  return <><div className="food-assistant-guided">
    {step !== "menu" && <button type="button" className="food-assistant-back proto-subtle" onClick={goBack} disabled={loading || saving}><ArrowLeft size={16} /> Voltar</button>}
    {step !== "menu" && <div className="food-assistant-flow" aria-label={`Etapa ${flowStep} de ${flowLabels.length}`}><span className="food-assistant-flow-count">Etapa {flowStep} de {flowLabels.length}</span>{flowLabels.map((label, index) => <span className={index + 1 === flowStep ? "is-current" : index + 1 < flowStep ? "is-done" : ""} key={label}>{index + 1}. {label}</span>)}</div>}
    {result && step !== "menu" && <p className="food-assistant-success" role="status"><Check size={17} /> {result}</p>}
    {step === "menu" && <>
      <div className="food-assistant-intro"><strong>O que você quer fazer agora?</strong><span>Eu vou conduzir você passo a passo. Nada é registrado sem sua confirmação.</span></div>
      <div className="food-assistant-guided-menu">
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("order")}><ShoppingCart size={22} /><span><strong>Criar um pedido</strong><small>Enviar para Recebido e acompanhar até a finalização.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("sale")}><ShoppingCart size={22} /><span><strong>Registrar uma venda</strong><small>Escolher o item, quantidade, preço e pagamento.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("stock")}><Boxes size={22} /><span><strong>Adicionar ao estoque</strong><small>Receber produtos congelados ou já prontos.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("prepare")}><ChefHat size={22} /><span><strong>Preparar</strong><small>Transformar itens separados em unidades prontas.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("loss")}><Trash2 size={22} /><span><strong>Dar baixa como perda</strong><small>Retirar produtos vencidos, estragados ou que não podem ficar para amanhã.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("register")}><PackagePlus size={22} /><span><strong>Cadastrar um produto</strong><small>Fazer o cadastro aqui, sem sair do assistente.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("registerIngredient")}><PackagePlus size={22} /><span><strong>Cadastrar um insumo</strong><small>Adicionar um ingrediente e sua quantidade inicial.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("edit")}><Pencil size={22} /><span><strong>Editar um produto</strong><small>Atualizar preço, estoque inicial e dados fiscais.</small></span></button>
      </div>
      {result && <p className="food-assistant-success" role="status"><Check size={17} /> {result}</p>}
    </>}
    {step === "product" && <>
      <div className="food-assistant-step-heading"><strong>{familyOptions ? `${familyOptions[0]?.productName ?? "Produto"}: escolha o sabor` : actionTitle}</strong><span>1. {familyOptions ? "Escolha o sabor" : "Escolha o produto"}</span></div>
      <label className="food-assistant-search">Buscar produto<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Digite o nome…" autoFocus /></label>
      {familyOptions && <button type="button" className="food-assistant-back proto-subtle" onClick={() => setFamilyOptions(null)}>← Voltar aos produtos</button>}
      {loading && <p className="proto-empty">Carregando produtos…</p>}
      {!loading && <div className="food-assistant-guided-products">{(familyOptions ? familyOptions.map(item => [item]) : productFamilies).map(group => { const item = group[0]; const isSelected = supportsMultipleSelection && selectedOrderProducts.some(selected => selected.id === item.id); const readyTotal = group.reduce((sum, product) => sum + product.stockQuantity, 0); const unpreparedTotal = group.reduce((sum, product) => sum + product.unpreparedQuantity, 0); return <div className="food-assistant-guided-product-row" key={familyOptions ? item.id : item.productName || item.id}><button type="button" aria-pressed={supportsMultipleSelection ? isSelected : undefined} className={`food-assistant-guided-product-main${isSelected ? " is-selected" : ""}`} onClick={() => familyOptions ? supportsMultipleSelection ? toggleOrderProduct(item) : chooseProduct(item) : chooseFamily(group)}><span><strong>{familyOptions ? item.flavor || "Sem sabor" : item.productName || item.name}</strong><small>{item.productionMode === "made_here" ? `${readyTotal} prontos · preparo livre` : `${readyTotal} prontos · ${unpreparedTotal} congelados`}{!familyOptions && group.length > 1 ? ` · ${group.length} sabores` : ""}</small>{!familyOptions && group.length > 1 && <small>{group.map(product => `${product.flavor || "sem sabor"}: ${product.stockQuantity} prontos · ${product.productionMode === "made_here" ? "preparo livre" : `${product.unpreparedQuantity} congelados`}`).join(" · ")}</small>}</span>{action === "sale" && <b>{item.salePriceCents > 0 ? guidedMoney(item.salePriceCents) : "Sem preço"}</b>}{supportsMultipleSelection && <span className="food-assistant-selection-mark">{isSelected ? "Selecionado" : "Selecionar"}</span>}</button></div>; })}</div>}
      {supportsMultipleSelection && !loading && <div className="food-assistant-order-selection-footer"><span>{selectedOrderProducts.length} item{selectedOrderProducts.length === 1 ? "" : "s"} selecionado{selectedOrderProducts.length === 1 ? "" : "s"}. Você poderá informar a quantidade de cada um na próxima etapa.</span><button type="button" className="food-assistant-confirm" disabled={!selectedOrderProducts.length} onClick={confirmOrderProductSelection}>Confirmar seleção</button></div>}
      {!loading && !(familyOptions ? familyOptions.length : productFamilies.length) && <p className="proto-empty">Nenhum produto encontrado.</p>}
    </>}
    {step === "details" && action === "order" && selectedOrderProducts.length > 0 && <>
      <div className="food-assistant-step-heading"><strong>Itens da comanda</strong><span>2. Informe a quantidade de cada produto ou sabor</span></div>
      <div className="food-assistant-order-main-fields"><label>Nome do cliente (opcional)<input autoFocus value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Digite o nome, se quiser" /><small>Você pode deixar em branco.</small></label><label>Modalidade<select value={fulfillment} onChange={event => { const next = event.target.value as GuidedFulfillment; setFulfillment(next); if (next === "pickup") setDeliveryAddress(""); }}><option value="pickup">Retirada na loja</option><option value="delivery">Entrega</option></select></label></div>
      {fulfillment === "delivery" && <label>Endereço de entrega<input required value={deliveryAddress} onChange={event => setDeliveryAddress(event.target.value)} placeholder="Rua, número, bairro e complemento" /><small>Esse endereço será impresso na comanda.</small></label>}
      <label>Forma de pagamento<select required value={payment} onChange={event => changePayment(event.target.value as GuidedPayment)}><option value="pending">Escolha uma forma de pagamento…</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option></select><small>Fica pré-selecionada na comanda e pode ser alterada depois.</small></label>
      {payment === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerId} onChange={setCreditCustomerId} loading={creditLoading} />}
      {payment === "cash" && <label>Dinheiro entregue (troco para)<input inputMode="decimal" value={cashReceived} onChange={event => setCashReceived(event.target.value)} placeholder={guidedMoney(selectedOrderTotalCents)} /><small>Deixe em branco para valor exato. Ex.: total de R$ 20,00 e dinheiro entregue de R$ 50,00.</small>{cashReceived.trim() && enteredOrderCashCents >= selectedOrderTotalCents && <small className="food-assistant-cash-change">Troco da comanda: {guidedMoney(selectedOrderChangeCents)}</small>}</label>}
      <div className="food-assistant-order-items">{selectedOrderProducts.map((selectedProduct, index) => {
        const quantity = Number(orderQuantities[selectedProduct.id] ?? 0);
        const requestedQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
        const readyQuantity = Math.min(requestedQuantity, selectedProduct.stockQuantity);
        const prepareQuantity = Math.max(0, requestedQuantity - readyQuantity);
        const availableToPrepare = selectedProduct.productionMode === "made_here" || selectedProduct.productionMode === "recipe" ? selectedProduct.preparationCapacity : selectedProduct.unpreparedQuantity;
        return <article className="food-assistant-order-item is-order" key={selectedProduct.id}>
          <header className="food-assistant-order-item-heading"><div><strong>{selectedProduct.productName || selectedProduct.name}{selectedProduct.flavor ? ` · ${selectedProduct.flavor}` : ""}</strong><small>Escolha quantas unidades entram nesta comanda.</small></div><label className="food-assistant-quantity-field">Quantidade<input autoFocus={index === 0} type="number" min="1" step="1" inputMode="numeric" value={orderQuantities[selectedProduct.id] ?? ""} onChange={event => updateOrderQuantity(selectedProduct.id, event.target.value)} placeholder="Ex.: 2" /></label></header>
          <div className="food-assistant-stock-overview" aria-label={`Estoque de ${selectedProduct.name}`}><div className="food-assistant-stock-stat is-ready"><strong>{selectedProduct.stockQuantity}</strong><span>prontas no estoque</span></div><div className="food-assistant-stock-stat is-preparation"><strong>{selectedProduct.productionMode === "made_here" ? "∞" : availableToPrepare}</strong><span>{selectedProduct.productionMode === "made_here" ? "preparo livre" : "congeladas"}</span></div></div>
          <div className="food-assistant-order-final"><strong>Distribuição automática</strong><small>{readyQuantity} pronta{readyQuantity === 1 ? "" : "s"} primeiro{prepareQuantity > 0 ? ` e ${prepareQuantity} para preparar` : ""}. Você não precisa escolher a origem.</small></div>
          {prepareQuantity > availableToPrepare && <small className="food-assistant-stock-warning">Não há quantidade suficiente para preparar o restante. Reduza a quantidade.</small>}
        </article>;
      })}</div>
      <div className="food-assistant-confirm-box"><strong>Confira antes de confirmar</strong><span>O sistema baixa as unidades prontas primeiro e prepara somente o que faltar.</span><span>O pagamento escolhido ficará visível na comanda para orientar a entrega.</span>{payment === "cash" && <span>{cashReceived.trim() ? `Dinheiro entregue: ${guidedMoney(enteredOrderCashCents)} · troco: ${guidedMoney(selectedOrderChangeCents)}` : "Dinheiro exato: sem troco"}</span>}</div>
      <button type="button" className="food-assistant-confirm" disabled={saving} onClick={() => void saveOperation()}>{saving ? "Salvando…" : "Confirmar comanda"}</button>
    </>}
    {step === "details" && (action === "sale" || action === "prepare") && selectedOrderProducts.length > 0 && <>
      <div className="food-assistant-step-heading"><strong>{action === "sale" ? "Itens da venda" : "Itens para preparar"}</strong><span>2. Informe a quantidade de cada produto ou sabor</span></div>
      <div className="food-assistant-order-items">{selectedOrderProducts.map((selectedProduct, index) => <article className="food-assistant-order-item" key={selectedProduct.id}><div><strong>{selectedProduct.productName || selectedProduct.name}{selectedProduct.flavor ? ` · ${selectedProduct.flavor}` : ""}</strong><small>{action === "sale" ? `Preço cadastrado: ${guidedMoney(selectedProduct.salePriceCents)}` : `${selectedProduct.unpreparedQuantity} não preparados disponíveis`}</small></div><label>Quantidade<input autoFocus={index === 0} type="number" min="1" step="1" inputMode="numeric" value={orderQuantities[selectedProduct.id] ?? ""} onChange={event => setOrderQuantities(current => ({ ...current, [selectedProduct.id]: event.target.value }))} placeholder="Ex.: 2" /></label>{action === "sale" && <><label>Ajuste por unidade (R$)<input inputMode="decimal" value={orderAdjustments[selectedProduct.id] ?? ""} onChange={event => setOrderAdjustments(current => ({ ...current, [selectedProduct.id]: event.target.value }))} placeholder="0,00 ou -1,00" /><small>Use valor positivo para adicional ou negativo para desconto.</small></label>{parseCents(orderAdjustments[selectedProduct.id] ?? "") !== 0 && <label>Justificativa<select required value={orderAdjustmentNotes[selectedProduct.id] ?? ""} onChange={event => setOrderAdjustmentNotes(current => ({ ...current, [selectedProduct.id]: event.target.value }))}><option value="">Escolha uma opção…</option>{PRICE_ADJUSTMENT_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}</>}</article>)}</div>
      {action === "sale" && <><label>Pagamento<select required value={payment === "pending" ? "" : payment} onChange={event => changePayment(event.target.value ? event.target.value as GuidedPayment : "pending")}><option value="">Escolha uma forma de pagamento…</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option><option value="brinde">Brinde (sem cobrança)</option></select></label>{payment === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerId} onChange={setCreditCustomerId} />}</>}
      <div className="food-assistant-confirm-box"><strong>Confira antes de confirmar</strong>{selectedOrderProducts.map(selectedProduct => <span key={selectedProduct.id}>{orderQuantities[selectedProduct.id] || "0"} × {selectedProduct.productName || selectedProduct.name}{selectedProduct.flavor ? ` · ${selectedProduct.flavor}` : ""}</span>)}{action === "prepare" && <span>Os itens serão retirados do estoque não preparado e ficarão prontos para venda.</span>}</div>
      <button type="button" className="food-assistant-confirm" disabled={saving} onClick={() => void saveOperation()}>{saving ? "Salvando…" : action === "sale" ? "Confirmar venda" : "Confirmar preparo"}</button>
    </>}
    {step === "details" && String(action) !== "order" && product && action && <>
      <div className="food-assistant-step-heading"><strong>{product.name}</strong><span>{action === "sale" ? "2. Informe os detalhes da venda" : action === "prepare" ? "2. Quantas unidades ficaram prontas?" : action === "stock" && product.productionMode !== "ingredient" ? "2. Quantas unidades chegaram para preparar?" : "2. Informe a quantidade"}</span></div>
      <div className={`food-assistant-guided-fields${action === "order" ? " is-order" : ""}`}>
        {action === "order" && <div className="food-assistant-order-main-fields"><div className="food-assistant-selected-flavor"><span>Sabor escolhido</span><strong>{product.flavor || "Sem sabor"}</strong><small>Este sabor tem estoque separado.</small></div><label>Quantidade<input autoFocus type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ex.: 2" /><small>{product.stockQuantity} prontas · {product.productionMode === "recipe" ? product.preparationCapacity : product.unpreparedQuantity} para preparar</small></label></div>}
        {action !== "order" && (action === "loss" && product.productionMode !== "ingredient" ? <><label>Prontos para venda<input autoFocus type="number" min="0" step="1" inputMode="numeric" value={readyLossQuantity} onChange={event => setReadyLossQuantity(event.target.value)} placeholder={`Ex.: ${product.stockQuantity}`} /><small>Disponíveis: {product.stockQuantity}</small></label><label>Para preparar<input type="number" min="0" step="1" inputMode="numeric" value={unpreparedLossQuantity} onChange={event => setUnpreparedLossQuantity(event.target.value)} placeholder={`Ex.: ${product.unpreparedQuantity}`} /><small>Disponíveis: {product.unpreparedQuantity}</small></label></> : <label>Quantidade<input autoFocus type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ex.: 10" /></label>)}
        {action === "sale" && <><label>Preço por unidade (R$)<input type="text" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder={payment === "brinde" ? "Brinde: R$ 0,00" : "Opcional"} disabled={payment === "brinde"} /><small>{payment === "brinde" ? "A forma de pagamento brinde define o valor zero." : "Se ficar diferente do cadastro, escolha uma justificativa."}</small></label><label>Pagamento<select required value={payment === "pending" ? "" : payment} onChange={event => changePayment(event.target.value ? event.target.value as GuidedPayment : "pending")}><option value="">Escolha uma forma de pagamento…</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option><option value="brinde">Brinde (sem cobrança)</option></select></label>{payment === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerId} onChange={setCreditCustomerId} loading={creditLoading} />}{(payment === "brinde" || (price.trim() && Math.round(guidedNumber(price) * 100) !== product.salePriceCents)) && <label>Justificativa do preço<select required value={adjustmentNote} onChange={event => setAdjustmentNote(event.target.value)}><option value="">Escolha uma opção…</option>{PRICE_ADJUSTMENT_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}</>}
        {action === "order" && <><label>Ajuste de valor (R$)<input inputMode="decimal" value={adjustment} onChange={event => setAdjustment(event.target.value)} placeholder="Ex.: 2,00 ou -1,00" /><small>Use valor positivo para adicional ou negativo para desconto.</small></label>{parseCents(adjustment) !== 0 && <label>Justificativa do ajuste<select required value={adjustmentNote} onChange={event => setAdjustmentNote(event.target.value)}><option value="">Escolha uma opção…</option>{PRICE_ADJUSTMENT_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}<label className={`proto-switch food-assistant-prep-switch${fryNow ? " is-active" : ""}`}><span>Preparar este item{fryNow && product.stockQuantity <= 0 ? " · ativado automaticamente" : ""}<small>{fryNow ? "Será fritado/assado antes de finalizar." : "Usará uma unidade já pronta."}</small></span><input type="checkbox" checked={fryNow} onChange={event => setFryNow(event.target.checked)} /></label></>}
        {action === "order" && <div className="food-assistant-order-final"><strong>Valor e distribuição na confirmação</strong><small>Primeiro confira o sabor e a quantidade. Na próxima etapa você escolherá as unidades prontas e o ajuste final.</small></div>}
      </div>
      {action === "stock" && product.productionMode !== "ingredient" && <small className="food-assistant-operation-help">{product.productionMode === "frozen" || product.productionMode === "resale" ? "A entrada ficará como congelado, para preparar depois." : "A entrada será registrada diretamente como unidade pronta."}</small>}
      {action === "prepare" && <small className="food-assistant-operation-help">Essa quantidade será retirada do estoque separado e adicionada ao estoque pronto.</small>}
      <div className="food-assistant-confirm-box"><strong>Confira antes de confirmar</strong>{action === "loss" && product.productionMode !== "ingredient" ? <><span>{readyLossQuantity || "0"} prontos para venda</span><span>{unpreparedLossQuantity || "0"} para preparar</span></> : <span>{quantity || "0"} × {product.name}</span>}{action === "order" && <span>Vai para Pedidos · Recebido</span>}{action === "sale" && <span>{price ? `${price} por unidade` : product.salePriceCents > 0 ? `${guidedMoney(product.salePriceCents)} por unidade` : "Preço não informado"}</span>}{action === "stock" && <span>{product.productionMode === "ingredient" ? "Entrada no estoque" : "Para preparar"}</span>}{action === "prepare" && <span>Preparado e pronto para venda</span>}{action === "loss" && <span>Baixar como perda</span>}</div>
      <button type="button" className="food-assistant-confirm" disabled={saving} onClick={() => void saveOperation()}>{saving ? "Salvando…" : "Confirmar operação"}</button>
    </>}
    {false && orderAllocation && action === "order" && <div className="food-assistant-stock-modal-backdrop" role="presentation"><section className="food-assistant-stock-modal" role="dialog" aria-modal="true" aria-labelledby="food-assistant-stock-title"><div className="food-assistant-stock-modal-heading"><div><strong id="food-assistant-stock-title">Distribuir estoque da comanda</strong><small>Escolha as unidades prontas de cada produto. O restante ficará para preparar.</small></div><button type="button" className="proto-subtle" onClick={() => setOrderAllocation(null)} disabled={saving}><X size={17} /></button></div><div className="food-assistant-allocation-list">{orderAllocation.items.map((allocation, allocationIndex) => { const readyQuantity = allocation.selectedReadyUnits.length; const prepareQuantity = allocation.quantity - readyQuantity; const availableToPrepare = allocation.product.productionMode === "recipe" ? allocation.product.preparationCapacity : allocation.product.unpreparedQuantity; return <article className="food-assistant-allocation-item" key={allocation.product.id}><header><div><strong>{allocation.product.productName || allocation.product.name}{allocation.product.flavor ? ` · ${allocation.product.flavor}` : ""}</strong><small>{allocation.quantity} unidade{allocation.quantity === 1 ? "" : "s"} · {allocation.product.stockQuantity} prontas · {availableToPrepare} para preparar</small></div><div className="food-assistant-ready-summary"><span><strong>{readyQuantity}</strong> prontas</span><span><strong>{prepareQuantity}</strong> preparar</span></div></header>{allocation.readyOptions > 0 ? <div className="food-assistant-ready-list">{Array.from({ length: allocation.readyOptions }, (_, index) => <label className={`food-assistant-ready-choice${allocation.selectedReadyUnits.includes(index) ? " is-selected" : ""}`} key={index}><input type="checkbox" checked={allocation.selectedReadyUnits.includes(index)} onChange={event => setOrderAllocation(current => current ? { ...current, items: current.items.map((entry, entryIndex) => entryIndex === allocationIndex ? { ...entry, selectedReadyUnits: event.target.checked ? [...entry.selectedReadyUnits, index] : entry.selectedReadyUnits.filter(item => item !== index) } : entry) } : current)} /><span>Pronta {index + 1}</span></label>)}</div> : <p className="food-assistant-stock-empty">Nenhuma unidade pronta disponível.</p>}{prepareQuantity > availableToPrepare && <p className="food-assistant-stock-warning">Selecione mais unidades prontas para completar este item.</p>}</article>; })}</div><div className="food-assistant-stock-modal-actions"><button type="button" className="proto-subtle" onClick={() => setOrderAllocation(null)} disabled={saving}>Voltar</button><button type="button" className="food-assistant-confirm" onClick={() => void confirmOrderAllocation()} disabled={saving || orderAllocation.items.some(item => item.quantity - item.selectedReadyUnits.length > (item.product.productionMode === "recipe" ? item.product.preparationCapacity : item.product.unpreparedQuantity))}>{saving ? "Salvando…" : "Confirmar comanda"}</button></div></section></div>}
    {step === "register" && action === "registerIngredient" && <form className="food-assistant-register-form food-assistant-ingredient-form" onSubmit={event => { event.preventDefault(); void saveRegistration(); }}>
      <div className="food-assistant-step-heading"><strong>Cadastrar insumo</strong><span>Informe apenas o que será controlado no estoque.</span></div>
      <div className="food-assistant-register-grid"><label>Nome do insumo<input required autoFocus value={newIngredientName} onChange={event => setNewIngredientName(event.target.value)} placeholder="Ex.: Farinha de trigo" /></label><label>Quantidade inicial<input required type="number" min="0" step="1" inputMode="numeric" value={newIngredientStock} onChange={event => setNewIngredientStock(event.target.value)} /><small>Em unidades de embalagem.</small></label><label>Custo por unidade (R$)<input inputMode="decimal" value={newIngredientCost} onChange={event => setNewIngredientCost(event.target.value)} placeholder="Opcional" /></label></div>
      <div className="food-assistant-review"><strong>Resumo</strong><span><b>Insumo:</b> {newIngredientName || "—"}</span><span><b>Estoque inicial:</b> {newIngredientStock || "0"} un.</span><span><b>Custo:</b> {newIngredientCost || "não informado"}</span></div>
      <button type="submit" className="food-assistant-confirm" disabled={saving}>{saving ? "Salvando…" : "Confirmar cadastro"}</button>
    </form>}
    {step === "register" && action !== "registerIngredient" && <form className="food-assistant-register-form" onSubmit={event => { event.preventDefault(); void saveRegistration(); }}>
      <div className="food-assistant-step-heading"><strong>{action === "edit" ? "Editar produto" : "Cadastrar produto"}</strong><span>{registrationStep === "mode" ? "Primeiro escolha como este item chega até a loja." : registrationStep === "basic" ? action === "edit" ? "Altere os dados principais do produto." : "Agora informe os dados do produto." : "Confira o estoque inicial por sabor antes de salvar."}</span></div>
      {registrationStep === "mode" && <>
        <fieldset className="food-assistant-register-modes"><legend>Como este item chega até a loja?</legend><div className="food-assistant-register-mode-grid">
          <button type="button" className={registrationMode === "frozen" ? "is-selected" : ""} onClick={() => chooseRegistrationMode("frozen")}><strong>Congelado</strong><small>Tem unidades congeladas para preparar e unidades já prontas.</small></button>
          <button type="button" className={registrationMode === "ready" ? "is-selected" : ""} onClick={() => chooseRegistrationMode("ready")}><strong>Já pronto</strong><small>É comprado pronto e não passa por preparo.</small></button>
          <button type="button" className={registrationMode === "made_here" ? "is-selected" : ""} onClick={() => chooseRegistrationMode("made_here")}><strong>Faço aqui</strong><small>Preparo na hora ou deixo pronto, sem limite de quantidade.</small></button>
        </div></fieldset>
        <button type="button" className="food-assistant-confirm" onClick={continueRegistration}>Continuar</button>
      </>}
      {registrationStep === "basic" && <>
        <div className="food-assistant-register-grid food-assistant-basic-grid">
          <label>Nome do produto<input required autoFocus value={registrationName} onChange={event => setRegistrationName(event.target.value)} placeholder="Ex.: Pastel" /></label>
          <div className="food-assistant-flavor-fields"><span className="food-assistant-field-label">Sabores ou variações com estoque próprio</span>{registrationFlavorFields.map((flavor, index) => <div className="food-assistant-flavor-row" key={index}><input value={flavor} onChange={event => setRegistrationFlavorFields(current => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={index === 0 ? "Ex.: Carne" : "Ex.: Presunto e queijo"} />{registrationFlavorFields.length > 1 && <button type="button" className="proto-subtle food-assistant-remove-flavor" aria-label={`Remover sabor ${index + 1}`} onClick={() => setRegistrationFlavorFields(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>}</div>)}{action !== "edit" && <button type="button" className="food-assistant-add-row food-assistant-add-flavor" onClick={() => setRegistrationFlavorFields(current => [...current, ""])}><Plus size={15} />Adicionar sabor</button>}<small>Cada sabor vira um cadastro separado, com preço e estoque próprios. Ex.: Pastel · Carne e Pastel · Presunto e queijo.</small></div>
          <div className="food-cost-field"><label>Custo para você (R$)<input inputMode="decimal" value={registrationCost} onChange={event => setRegistrationCost(event.target.value)} placeholder="Ex.: 2,50" /></label><button type="button" className="proto-subtle food-cost-calculator-button" onClick={() => setRegistrationCostCalculatorOpen(true)}><Calculator size={15} />{registrationCostBreakdown ? "Recalcular custo" : "Calcular custo"}</button>{registrationCostBreakdown && <small className="food-cost-reference">Detalhamento salvo. Você pode editar o valor estimado acima.</small>}</div>
          <label>Preço de venda (R$)<input inputMode="decimal" value={registrationPrice} onChange={event => setRegistrationPrice(event.target.value)} placeholder="Ex.: 5,00" /></label>
        </div>
        <section className="food-assistant-register-section food-assistant-attendance-section">
          <div className="food-assistant-section-heading">
            <span className="food-assistant-section-icon" aria-hidden="true"><MessageCircle size={17} /></span>
            <div><strong>Nomes usados no atendimento</strong><small>O assistente reconhece o nome do produto e os apelidos informados abaixo.</small></div>
          </div>
          <label className="food-assistant-section-field">Outros nomes reconhecidos<input value={registrationAliases} onChange={event => setRegistrationAliases(event.target.value)} placeholder="Ex.: salgado, pastelzinho" /><small>Separe os nomes por vírgula.</small></label>
          <div className="food-assistant-variants">
            <div className="food-assistant-variants-heading">
              <div><strong>Opções extras do atendimento</strong><small>Use para tamanho, borda ou outro adicional que compartilhe o mesmo estoque.</small></div>
              <button type="button" className="proto-subtle" onClick={addRegistrationVariant}><Plus size={15} />Adicionar opção</button>
            </div>
            {registrationVariants.map(variant => <div className="food-assistant-variant-row" key={variant.id}>
              <label>Nome da opção<input required value={variant.name} onChange={event => updateRegistrationVariant(variant.id, { name: event.target.value })} placeholder="Ex.: tamanho grande" /></label>
              <label>Nome reconhecido<input value={variant.aliases.join(", ")} onChange={event => updateRegistrationVariant(variant.id, { aliases: event.target.value.split(",").map(alias => alias.trim()).filter(Boolean) })} placeholder="Ex.: grande" /></label>
              <label>Adicional (R$)<input min="0" inputMode="decimal" value={(variant.priceDeltaCents / 100).toFixed(2).replace(".", ",")} onChange={event => { const cents = parseCents(event.target.value); updateRegistrationVariant(variant.id, { priceDeltaCents: Math.max(0, cents) }); }} placeholder="0,00" /></label>
              <button type="button" className="proto-subtle" aria-label={`Remover opção ${variant.name || "sem nome"}`} onClick={() => removeRegistrationVariant(variant.id)}><Trash2 size={15} /></button>
            </div>)}
            {!registrationVariants.length && <small>Nenhuma opção extra cadastrada. Para pastel de carne e presunto e queijo, use os sabores acima.</small>}
          </div>
        </section>
        <button type="button" className="food-assistant-confirm" onClick={continueRegistration}>Continuar</button>
      </>}
      {registrationStep === "source" && <>
        <section className="food-assistant-register-section"><strong>Estoque inicial por sabor</strong><small>{registrationMode === "frozen" ? "Informe quantos estão congelados e quantos já estão prontos." : registrationMode === "ready" ? "Tudo o que você comprar entra como pronto." : "Este produto pode ser preparado sem limite. Informe apenas o que já está pronto, se houver."}</small>{registrationFlavorRows.map(flavor => <div className="food-assistant-register-flavor-row" key={registrationFlavorKey(flavor)}><strong>{flavor || "Produto sem sabor"}</strong>{registrationMode === "frozen" && <label>Congelados<input type="number" min="0" step="1" value={registrationFlavorStock[registrationFlavorKey(flavor)] ?? "0"} onChange={event => setRegistrationFlavorStock(current => ({ ...current, [registrationFlavorKey(flavor)]: event.target.value }))} /></label>}<label>Já preparados<input type="number" min="0" step="1" value={registrationFlavorReady[registrationFlavorKey(flavor)] ?? "0"} onChange={event => setRegistrationFlavorReady(current => ({ ...current, [registrationFlavorKey(flavor)]: event.target.value }))} /></label></div>)}</section>
        <div className="food-assistant-review"><strong>Resumo</strong><span><b>Produto:</b> {registrationName || "—"}</span><span><b>Sabores:</b> {registrationFlavors.join(", ") || "sem sabor"}</span><span><b>Tipo:</b> {registrationMode === "frozen" ? "Congelado" : registrationMode === "ready" ? "Já pronto" : "Faço aqui"}</span><span><b>Custo:</b> {registrationCost || "não informado"}</span><span><b>Venda:</b> {registrationPrice || "não informado"}</span><span><b>Fiscal:</b> ficará para uma etapa futura.</span></div>
        <button type="submit" className="food-assistant-confirm" disabled={saving}>{saving ? "Salvando…" : action === "edit" ? "Salvar alterações" : "Confirmar e salvar cadastro"}</button>
      </>}
    </form>}
    {error && <p role="alert" className="food-assistant-error">{error}</p>}
  </div>{registrationCostCalculatorOpen && <CostCalculator initial={registrationCostBreakdown} onApply={result => { setRegistrationCostBreakdown(result.breakdown); setRegistrationCost((result.costPriceCents / 100).toFixed(2).replace(".", ",")); setRegistrationPrice((result.salePriceCents / 100).toFixed(2).replace(".", ",")); setRegistrationCostCalculatorOpen(false); setError(""); }} onClose={() => setRegistrationCostCalculatorOpen(false)} />}</>;
}

export function FoodAssistant() {
  const [open, setOpen] = useState(false);
  const [guided, setGuided] = useState(true);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Escreva uma ou várias ações. Você confere tudo antes de registrar.");
  const [drafts, setDrafts] = useState<AssistantDraft[]>([]);
  const [registration, setRegistration] = useState<AssistantRegistrationDraft | null>(null);
  const [pendingRegistrationQuestion, setPendingRegistrationQuestion] = useState<AssistantRegistrationQuestion | null>(null);
  const [choices, setChoices] = useState<{ id: string; name: string; stockQuantity?: number; unpreparedQuantity?: number }[]>([]);
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<Record<string, string>>({});
  const [adjustmentNotes, setAdjustmentNotes] = useState<Record<string, string>>({});
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomerRecord[]>([]);
  const [creditCustomerIds, setCreditCustomerIds] = useState<Record<string, string>>({});
  const [creditLoading, setCreditLoading] = useState(false);
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const show = (event: Event) => {
      setOpen(true);
      setGuided(true);
      const detail = (event as CustomEvent<{ action?: string; productId?: string }>).detail;
      setEditProductId(detail?.action === "edit" && detail.productId ? detail.productId : null);
    };
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
        setAdjustmentNotes({});
        setCreditCustomerIds({});
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
  const loadCreditCustomers = async () => {
    if (creditCustomers.length || creditLoading) return;
    setCreditLoading(true);
    try {
      const data = await getCreditLedger();
      setCreditCustomers(data.customers.filter(customer => customer.creditAccount));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes do crediário.");
    } finally {
      setCreditLoading(false);
    }
  };
  const changeDraftPayment = (draftId: string, value: string) => {
    setPayments(current => ({ ...current, [draftId]: value }));
    if (value === "brinde") setTotals(current => ({ ...current, [draftId]: "0,00" }));
    if (value === "crediario") void loadCreditCustomers();
    else setCreditCustomerIds(current => ({ ...current, [draftId]: "" }));
  };
  async function confirm() {
    if ((!drafts.length && !registration) || busy) return;
    const confirmations = drafts.map(draft => {
      const value = draft.action === "sale" ? totals[draft.id] ?? "" : String(draft.totalCents / 100);
      const totalCents = Math.round(Number(value.replace(",", ".")) * 100);
      return { draftId: draft.id, totalCents, paymentMethod: draft.action === "sale" && payments[draft.id] !== "pending" ? payments[draft.id] as SalePaymentMethod : null, creditCustomerId: draft.action === "sale" && payments[draft.id] === "crediario" ? creditCustomerIds[draft.id] || undefined : undefined, adjustmentNote: adjustmentNotes[draft.id] || null };
    });
    if (confirmations.some(item => drafts.some(draft => draft.id === item.draftId && draft.action === "sale") && !item.paymentMethod)) { setNotice("Escolha a forma de pagamento de cada venda."); return; }
    if (confirmations.some(item => item.paymentMethod === "brinde" && item.totalCents !== 0)) { setNotice("Uma venda como brinde precisa ter valor total zero."); return; }
    if (confirmations.some(item => !Number.isSafeInteger(item.totalCents) || item.totalCents < 0)) { setNotice("Confira os valores das vendas."); return; }
    if (confirmations.some(item => item.paymentMethod === "crediario" && !item.creditCustomerId)) { setNotice("Selecione o cliente de cada venda no crediário."); return; }
    if (drafts.some(draft => draft.action === "sale" && (totals[draft.id] ?? "") && draft.baseUnitPriceCents !== undefined && Math.round(Number((totals[draft.id] ?? "").replace(",", ".")) * 100) !== draft.quantity * draft.baseUnitPriceCents && !adjustmentNotes[draft.id])) { setNotice("Escolha a justificativa para cada preço diferente do cadastro."); return; }
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
      {guided ? <GuidedAssistant editProductId={editProductId} onEditHandled={() => setEditProductId(null)} /> : <>
      <button type="button" className="food-assistant-back proto-subtle" onClick={() => setGuided(true)} disabled={busy}><ArrowLeft size={16} /> Voltar às opções</button>
      <p role="status">{notice}</p>
      <form onSubmit={event => { event.preventDefault(); void interpret(); }}>
        <label>Mensagem para o assistente<textarea ref={textArea} autoFocus rows={3} maxLength={3000} disabled={busy} value={text} placeholder="Ex.: vendi 50 pães e fritei 10 pastéis" onChange={event => { setText(event.target.value); setDrafts([]); setRegistration(null); setChoices([]); }} /><small>Escreva uma ou várias ações. Depois de analisar, eu mostro o que será feito antes de registrar.</small></label>
        <div className="proto-toolbar"><button type="submit" disabled={busy || !text.trim()}><Play size={18} /> Analisar texto</button></div>
      </form>
      {choices.length > 0 && <div className="food-assistant-choices"><strong>Escolha o produto ou sabor</strong>{choices.map(choice => <button type="button" key={choice.id} disabled={busy} onClick={() => void interpret(text, choice.id)}><strong>{choice.name}</strong><small>{choice.stockQuantity ?? 0} prontos · {choice.unpreparedQuantity ?? 0} não preparados</small></button>)}</div>}
      {registration && <section className="food-assistant-drafts" aria-label="Novo insumo"><header><strong>Confira o novo insumo</strong><small>Ele será criado como insumo contado por unidade e já entrará no estoque.</small></header><article className="proto-ticket"><div><small>Cadastro de insumo</small><strong>{registration.quantity} {unitLabel(registration.stockUnit)} · {registration.name}</strong></div><small>Depois você poderá anexar este insumo a um produto e informar o rendimento aproximado.</small></article><div className="proto-toolbar"><button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Cadastrando…" : "Cadastrar insumo"}</button><button type="button" className="proto-subtle" disabled={busy} onClick={editTranscription}>Editar texto</button></div></section>}
      {drafts.length > 0 && <section className="food-assistant-drafts" aria-label="Operações encontradas"><header><strong>Confira antes de registrar</strong><small>{drafts.length} item{drafts.length === 1 ? "" : "s"} na mesma mensagem</small></header>{drafts.map(draft => { const changedPrice = draft.action === "sale" && draft.baseUnitPriceCents !== undefined && Math.round(Number((totals[draft.id] ?? "").replace(",", ".")) * 100) !== draft.quantity * draft.baseUnitPriceCents; return <article className="proto-ticket" key={draft.id}><div><small>{actionLabel(draft.action)}</small><strong>{draft.quantity} × {draft.productName}</strong></div>{draft.action === "sale" && <><label>Total da venda (R$)<input disabled={busy} inputMode="decimal" value={totals[draft.id] ?? ""} onChange={event => setTotals(current => ({ ...current, [draft.id]: event.target.value }))} /></label>{changedPrice && <label>Justificativa do preço<select required disabled={busy} value={adjustmentNotes[draft.id] ?? ""} onChange={event => setAdjustmentNotes(current => ({ ...current, [draft.id]: event.target.value }))}><option value="">Escolha uma opção…</option>{PRICE_ADJUSTMENT_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}<label>Pagamento<select required disabled={busy} value={payments[draft.id] === "pending" ? "" : payments[draft.id] ?? ""} onChange={event => changeDraftPayment(draft.id, event.target.value || "pending")}><option value="">Escolha uma forma de pagamento…</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_credit">Cartão de crédito</option><option value="card_debit">Cartão de débito</option><option value="meal_voucher">Vale-alimentação</option><option value="crediario">Crediário</option><option value="brinde">Brinde (sem cobrança)</option></select></label>{payments[draft.id] === "crediario" && <CreditCustomerPicker customers={creditCustomers} value={creditCustomerIds[draft.id] ?? ""} onChange={customerId => setCreditCustomerIds(current => ({ ...current, [draft.id]: customerId }))} loading={creditLoading} />}</>}</article>; })}<div className="proto-toolbar"><button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Registrando…" : `Registrar ${drafts.length} operação${drafts.length === 1 ? "" : "ões"}`}</button><button type="button" className="proto-subtle" disabled={busy} onClick={editTranscription}>Editar texto</button></div></section>}
      </>}
    </section>}
    <button type="button" className="food-assistant-toggle" aria-expanded={open} aria-label="Abrir assistente" onClick={toggleAssistant}><Wand2 aria-hidden="true" size={27} /><span>Abrir assistente</span></button>
  </div>;
}
