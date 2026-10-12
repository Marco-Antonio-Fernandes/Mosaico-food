import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Boxes, Check, ChefHat, Mic, PackagePlus, Play, ShoppingCart, Square, Trash2, Wand2, X } from "lucide-react";
import { assistantConfirmBatch, assistantPreview, createFoodProduct, getFoodProducts, interpretFoodText, registerCounterSale, registerFoodStock, transcribeFoodAudio, type AssistantDraft, type AssistantRegistrationDraft, type AssistantRegistrationQuestion, type FoodProduct, type ProductInput } from "@/lib/food-api";
import { audioToWav } from "@/lib/audio";

const registrationWords = /\b(cadastre|cadastrar|cadastra|registre|registrar|registra|adicione|adicionar|adiciona)\b/i;
const unitLabel = (unit: AssistantRegistrationDraft["stockUnit"]) => unit === "g" ? "g" : unit === "ml" ? "ml" : "un";
type LiveSpeechResult = { isFinal: boolean; 0: { transcript: string } };
type LiveSpeechEvent = { resultIndex: number; results: ArrayLike<LiveSpeechResult> };
type LiveSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: LiveSpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};
type LiveSpeechRecognitionConstructor = new () => LiveSpeechRecognition;

function createLiveSpeechRecognition() {
  const speechWindow = window as Window & {
    SpeechRecognition?: LiveSpeechRecognitionConstructor;
    webkitSpeechRecognition?: LiveSpeechRecognitionConstructor;
  };
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
}

function stopLiveSpeech(recognition: LiveSpeechRecognition | null) {
  try { recognition?.stop(); } catch { /* já pode ter encerrado */ }
}

function abortLiveSpeech(recognition: LiveSpeechRecognition | null) {
  try { recognition?.abort?.(); } catch { /* já pode ter encerrado */ }
}

type GuidedAction = "sale" | "stock" | "loss" | "register";
type GuidedStep = "menu" | "product" | "state" | "details" | "register";
type GuidedPayment = "pending" | "pix" | "cash" | "card";
type RegistrationStep = "basic" | "source";
type RegistrationArrival = "ready" | "unprepared";

const guidedMoney = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const guidedNumber = (value: string) => Number(value.replace(",", "."));

function GuidedAssistant({ onUseFreeform, onStartVoice }: { onUseFreeform: () => void; onStartVoice: () => void }) {
  const [step, setStep] = useState<GuidedStep>("menu");
  const [action, setAction] = useState<GuidedAction | null>(null);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [payment, setPayment] = useState<GuidedPayment>("pending");
  const [stockState, setStockState] = useState<"ready" | "unprepared" | "prepare" | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [registrationMode, setRegistrationMode] = useState<FoodProduct["productionMode"]>("resale");
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>("basic");
  const [registrationArrival, setRegistrationArrival] = useState<RegistrationArrival>("ready");
  const [registrationName, setRegistrationName] = useState("");
  const [registrationCategory, setRegistrationCategory] = useState("Lanches");
  const [registrationPrice, setRegistrationPrice] = useState("");
  const [registrationStock, setRegistrationStock] = useState("0");
  const [registrationUnit, setRegistrationUnit] = useState<FoodProduct["stockUnit"]>("un");
  const [registrationWeight, setRegistrationWeight] = useState("");
  const [registrationVolume, setRegistrationVolume] = useState("");
  const [registrationRecipe, setRegistrationRecipe] = useState<FoodProduct["recipe"]>([]);
  const [registrationAllowOnDemand, setRegistrationAllowOnDemand] = useState(false);
  const [registrationFryToOrder, setRegistrationFryToOrder] = useState(false);

  const loadProducts = async (nextAction: GuidedAction) => {
    setLoading(true);
    setError("");
    try {
      const loaded = await getFoodProducts({ activeOnly: true });
      setProducts(nextAction === "sale" ? loaded.filter(item => item.productionMode !== "ingredient") : loaded);
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
    setPrice("");
    setPayment("pending");
    setStockState(null);
    setRegistrationMode("resale");
    setRegistrationStep("basic");
    setRegistrationArrival("ready");
    setRegistrationName("");
    setRegistrationCategory("Lanches");
    setRegistrationPrice("");
    setRegistrationStock("0");
    setRegistrationUnit("un");
    setRegistrationWeight("");
    setRegistrationVolume("");
    setRegistrationRecipe([]);
    setRegistrationAllowOnDemand(false);
    setRegistrationFryToOrder(false);
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
    setError("");
    if (action === "sale") setPrice(nextProduct.salePriceCents > 0 ? (nextProduct.salePriceCents / 100).toFixed(2).replace(".", ",") : "");
    if (action === "stock" && nextProduct.productionMode !== "ingredient") {
      setStep("state");
      return;
    }
    if (action === "stock") setStockState("ready");
    setStep("details");
  };

  const addStockBeforeSale = (nextProduct: FoodProduct) => {
    setAction("stock");
    setProduct(nextProduct);
    setQuantity("");
    setPrice("");
    setPayment("pending");
    setError("");
    setStockState(nextProduct.productionMode === "ingredient" ? "ready" : null);
    setStep(nextProduct.productionMode === "ingredient" ? "details" : "state");
  };

  const resetToMenu = () => {
    setStep("menu");
    setAction(null);
    setProduct(null);
    setQuantity("");
    setPrice("");
    setPayment("pending");
    setStockState(null);
    setSearch("");
    setError("");
    setRegistrationStep("basic");
    setRegistrationArrival("ready");
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
    setStep(step === "state" ? "product" : action === "stock" && product?.productionMode !== "ingredient" ? "state" : "product");
  };

  const saveOperation = async () => {
    if (!product || !action || saving) return;
    const parsedQuantity = guidedNumber(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Informe uma quantidade inteira maior que zero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (action === "sale") {
        const parsedPrice = price.trim() ? guidedNumber(price) : product.salePriceCents / 100;
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          setError("Informe um preço válido por unidade.");
          return;
        }
        const unitPriceCents = Math.round(parsedPrice * 100);
        await registerCounterSale({ operationId: crypto.randomUUID(), paymentMethod: payment === "pending" ? null : payment, items: [{ productId: product.id, quantity: parsedQuantity, unitPriceCents }] });
        setResult(`${parsedQuantity} × ${product.name} vendido${parsedQuantity === 1 ? "" : "s"} por ${guidedMoney(unitPriceCents * parsedQuantity)}.`);
      } else {
        const stockAction = action === "loss" ? "loss" : stockState === "prepare" ? "prepare" : stockState === "unprepared" ? "receive_unprepared" : "receive_ready";
        await registerFoodStock(product.id, { operationId: crypto.randomUUID(), action: stockAction, quantity: parsedQuantity });
        const label = stockAction === "loss" ? "baixado como perda" : stockAction === "prepare" ? "preparado" : stockAction === "receive_unprepared" ? "separado para preparar" : "adicionado pronto";
        setResult(`${parsedQuantity} × ${product.name} foi ${label}.`);
      }
      window.dispatchEvent(new Event("food-stock-changed"));
      resetToMenu();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a operação.");
    } finally {
      setSaving(false);
    }
  };

  const saveRegistration = async () => {
    if (saving) return;
    if (!registrationName.trim() || !registrationCategory.trim()) {
      setError("Informe o nome e a categoria do produto.");
      return;
    }
    const parsedPrice = registrationPrice.trim() ? guidedNumber(registrationPrice) : 0;
    const parsedStock = guidedNumber(registrationStock);
    const parsedWeight = registrationWeight.trim() ? guidedNumber(registrationWeight) : null;
    const parsedVolume = registrationVolume.trim() ? guidedNumber(registrationVolume) : null;
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedStock) || parsedStock < 0) {
      setError("Confira preço e quantidades. Use números inteiros para o estoque.");
      return;
    }
    if (registrationMode === "ingredient" && ((parsedWeight !== null && (!Number.isInteger(parsedWeight) || parsedWeight <= 0)) || (parsedVolume !== null && (!Number.isInteger(parsedVolume) || parsedVolume <= 0)))) {
      setError("Peso e volume devem ser números inteiros maiores que zero.");
      return;
    }
    const incompleteRecipe = registrationRecipe.some(row => !row.ingredientId || !Number.isInteger(row.quantity) || row.quantity <= 0);
    const duplicatedRecipe = new Set(registrationRecipe.map(row => row.ingredientId)).size !== registrationRecipe.length;
    if (registrationMode === "recipe" && (incompleteRecipe || duplicatedRecipe)) {
      setError("Corrija os insumos da receita ou salve sem ingredientes para completar depois.");
      return;
    }
    const input: ProductInput = {
      productionMode: registrationMode,
      stockUnit: registrationMode === "ingredient" ? registrationUnit : "un",
      unitWeightGrams: registrationMode === "ingredient" ? parsedWeight : null,
      unitVolumeMl: registrationMode === "ingredient" ? parsedVolume : null,
      recipe: registrationMode === "recipe" ? registrationRecipe : [],
      unpreparedQuantity: 0,
      name: registrationName.trim(),
      category: registrationCategory.trim(),
      aliases: [],
      variants: [],
      salePriceCents: Math.round(parsedPrice * 100),
      stockQuantity: parsedStock,
      allowOnDemand: registrationMode !== "ingredient" && registrationAllowOnDemand,
      fryToOrder: registrationMode !== "ingredient" && registrationFryToOrder,
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

  const continueRegistration = () => {
    setError("");
    if (registrationStep === "basic") {
      const parsedPrice = registrationPrice.trim() ? guidedNumber(registrationPrice) : 0;
      if (!registrationName.trim() || !registrationCategory.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
        setError("Informe nome, categoria e um preço válido ou deixe o preço em branco.");
        return;
      }
      setRegistrationStep("source");
      return;
    }
  };

  const filteredProducts = products.filter(item => `${item.name} ${item.category} ${item.aliases.join(" ")}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const registrationIngredients = products.filter(item => item.productionMode === "ingredient" && item.active);
  const actionTitle = action === "sale" ? "Nova venda" : action === "stock" ? "Entrada no estoque" : action === "loss" ? "Dar baixa como perda" : "Preparo / fritar / assar";
  const flowStep = step === "product" ? 1 : step === "state" ? 2 : step === "details" ? 3 : registrationStep === "basic" ? 1 : 2;
  const flowLabels = action === "register" ? ["Dados", "Origem e configuração"] : ["Produto", action === "stock" ? "Estado" : "Detalhes", "Confirmar"];

  return <div className="food-assistant-guided">
    {step !== "menu" && <button type="button" className="food-assistant-back proto-subtle" onClick={goBack} disabled={loading || saving}><ArrowLeft size={16} /> Voltar</button>}
    {step !== "menu" && <div className="food-assistant-flow" aria-label={`Etapa ${flowStep} de ${flowLabels.length}`}><span className="food-assistant-flow-count">Etapa {flowStep} de {flowLabels.length}</span>{flowLabels.map((label, index) => <span className={index + 1 === flowStep ? "is-current" : index + 1 < flowStep ? "is-done" : ""} key={label}>{index + 1}. {label}</span>)}</div>}
    {step === "menu" && <>
      <div className="food-assistant-intro"><strong>O que você quer fazer agora?</strong><span>Eu vou conduzir você passo a passo. Nada é registrado sem sua confirmação.</span></div>
      <div className="food-assistant-guided-menu">
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("sale")}><ShoppingCart size={22} /><span><strong>Registrar uma venda</strong><small>Escolher o item, quantidade, preço e pagamento.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("stock")}><Boxes size={22} /><span><strong>Adicionar ao estoque</strong><small>Dizer se chegou pronto ou ainda precisa preparar.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("loss")}><Trash2 size={22} /><span><strong>Dar baixa como perda</strong><small>Retirar produtos vencidos, estragados ou que não podem ficar para amanhã.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={onStartVoice}><Mic size={22} /><span><strong>Falar uma ação</strong><small>Fale várias coisas; eu mostro a prévia e peço confirmação.</small></span></button>
        <button type="button" className="food-assistant-guided-choice" onClick={() => chooseAction("register")}><PackagePlus size={22} /><span><strong>Cadastrar um produto</strong><small>Fazer o cadastro aqui, sem sair do assistente.</small></span></button>
      </div>
      {result && <p className="food-assistant-success" role="status"><Check size={17} /> {result}</p>}
      <div className="food-assistant-guided-footer"><span>Prefere falar ou escrever?</span><button type="button" className="proto-subtle" onClick={onUseFreeform}>Usar texto ou voz</button></div>
    </>}
    {step === "product" && <>
      <div className="food-assistant-step-heading"><strong>{actionTitle}</strong><span>1. Escolha o produto</span></div>
      <label className="food-assistant-search">Buscar produto<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Digite o nome…" autoFocus /></label>
      {loading && <p className="proto-empty">Carregando produtos…</p>}
      {!loading && <div className="food-assistant-guided-products">{filteredProducts.map(item => <div className="food-assistant-guided-product-row" key={item.id}><button type="button" className="food-assistant-guided-product-main" onClick={() => chooseProduct(item)}><span><strong>{item.name}</strong><small>{item.stockQuantity > 0 ? `${item.stockQuantity} prontos` : "Sem estoque"}{item.unpreparedQuantity > 0 ? ` · ${item.unpreparedQuantity} para preparar` : ""}</small></span>{action === "sale" && <b>{item.salePriceCents > 0 ? guidedMoney(item.salePriceCents) : "Sem preço"}</b>}</button>{action === "sale" && <button type="button" className="food-assistant-guided-add-stock" onClick={() => addStockBeforeSale(item)}>Adicionar estoque</button>}</div>)}</div>}
      {!loading && !filteredProducts.length && <p className="proto-empty">Nenhum produto encontrado.</p>}
    </>}
    {step === "state" && product && <>
      <div className="food-assistant-step-heading"><strong>{product.name}</strong><span>2. Como entrou no estoque?</span></div>
      <div className="food-assistant-state-grid"><button type="button" onClick={() => { setStockState("ready"); setStep("details"); }}><Check size={20} /><strong>Entrou pronto</strong><small>Já pode ser vendido</small></button><button type="button" onClick={() => { setStockState("unprepared"); setStep("details"); }}><ChefHat size={20} /><strong>Para preparar</strong><small>Fica separado até fritar, assar ou finalizar</small></button><button type="button" onClick={() => { setStockState("prepare"); setStep("details"); }}><ChefHat size={20} /><strong>Preparar agora</strong><small>Fritar, assar ou finalizar o que está separado</small></button></div>
    </>}
    {step === "details" && product && action && <>
      <div className="food-assistant-step-heading"><strong>{product.name}</strong><span>{action === "sale" ? "2. Informe os detalhes da venda" : stockState === "prepare" ? "2. Quantas unidades preparar?" : "2. Informe a quantidade"}</span></div>
      <div className="food-assistant-guided-fields">
        <label>Quantidade<input autoFocus type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ex.: 10" /></label>
        {action === "sale" && <><label>Preço por unidade (R$)<input type="text" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="Opcional" /></label><label>Pagamento<select value={payment} onChange={event => setPayment(event.target.value as GuidedPayment)}><option value="pending">Pendente / não informado</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option></select></label></>}
      </div>
      <div className="food-assistant-confirm-box"><strong>Confira antes de confirmar</strong><span>{quantity || "0"} × {product.name}</span>{action === "sale" && <span>{price ? `${price} por unidade` : product.salePriceCents > 0 ? `${guidedMoney(product.salePriceCents)} por unidade` : "Preço não informado"}</span>}{action === "stock" && <span>{stockState === "prepare" ? "Preparar agora" : stockState === "unprepared" ? "Para preparar" : "Pronto"}</span>}{action === "loss" && <span>Baixar como perda</span>}</div>
      <button type="button" className="food-assistant-confirm" disabled={saving} onClick={() => void saveOperation()}>{saving ? "Salvando…" : "Confirmar operação"}</button>
    </>}
    {step === "register" && <form className="food-assistant-register-form" onSubmit={event => { event.preventDefault(); void saveRegistration(); }}>
      <div className="food-assistant-step-heading"><strong>Cadastrar produto</strong><span>{registrationStep === "basic" ? "Primeiro informe os dados principais." : "Agora me diga como este item chega ou é produzido."}</span></div>
      {registrationStep === "basic" && <>
        <div className="food-assistant-register-grid food-assistant-basic-grid"><label>Nome do produto<input required autoFocus value={registrationName} onChange={event => setRegistrationName(event.target.value)} placeholder="Ex.: Pastel de carne" /></label><label>Preço de venda (R$)<input inputMode="decimal" value={registrationPrice} onChange={event => setRegistrationPrice(event.target.value)} placeholder="Opcional" /><small>Você pode informar depois.</small></label><label>Categoria<input required value={registrationCategory} onChange={event => setRegistrationCategory(event.target.value)} placeholder="Ex.: Salgados" /></label></div>
        <button type="button" className="food-assistant-confirm" onClick={continueRegistration}>Continuar</button>
      </>}
      {registrationStep === "source" && <>
        <fieldset className="food-assistant-register-modes"><legend>Como este item chega até a loja?</legend><div className="food-assistant-register-mode-grid">
          <button type="button" className={registrationMode === "ingredient" ? "is-selected" : ""} onClick={() => setRegistrationMode("ingredient")}><strong>É um insumo</strong><small>Farinha, presunto, óleo ou item usado em receitas.</small></button>
          <button type="button" className={registrationMode === "resale" && registrationArrival === "ready" ? "is-selected" : ""} onClick={() => { setRegistrationMode("resale"); setRegistrationArrival("ready"); }}><strong>Já vem pronto</strong><small>Recebo e já posso vender.</small></button>
          <button type="button" className={registrationMode === "resale" && registrationArrival === "unprepared" ? "is-selected" : ""} onClick={() => { setRegistrationMode("resale"); setRegistrationArrival("unprepared"); }}><strong>Vem cru ou congelado</strong><small>Recebo o produto e lanço a quantidade depois em “Adicionar ao estoque”.</small></button>
          <button type="button" className={registrationMode === "recipe" ? "is-selected" : ""} onClick={() => setRegistrationMode("recipe")}><strong>Faço aqui com insumos</strong><small>Uso uma receita e posso preparar depois.</small></button>
        </div></fieldset>
        {registrationMode === "ingredient" && <section className="food-assistant-register-section"><strong>Medida do insumo</strong><small>Você pode controlar 1 unidade e informar o peso e/ou volume dela.</small><div className="food-assistant-register-grid"><label>Unidade do estoque<select value={registrationUnit} onChange={event => setRegistrationUnit(event.target.value as FoodProduct["stockUnit"])}><option value="un">Unidade</option><option value="g">Somente gramas</option><option value="ml">Somente mililitros</option></select></label><label>Peso de 1 unidade (g)<input type="number" min="1" step="1" value={registrationWeight} onChange={event => setRegistrationWeight(event.target.value)} placeholder="Ex.: 200" /></label><label>Volume de 1 unidade (ml)<input type="number" min="1" step="1" value={registrationVolume} onChange={event => setRegistrationVolume(event.target.value)} placeholder="Ex.: 500" /></label></div></section>}
        <section className="food-assistant-register-section"><strong>Estoque inicial <small>(opcional)</small></strong><div className="food-assistant-register-grid"><label>{registrationMode === "ingredient" ? `Quantidade inicial (${registrationUnit})` : "Unidades prontas"}<input type="number" min="0" step="1" value={registrationStock} onChange={event => setRegistrationStock(event.target.value)} /></label></div>{registrationMode !== "ingredient" && <small>O que chegar cru, congelado ou precisar de preparo será lançado depois em “Adicionar ao estoque”.</small>}</section>
        {registrationMode === "recipe" && <details className="food-assistant-register-details"><summary>Adicionar receita agora (opcional)</summary><small>Se ainda não cadastrou um insumo, deixe para adicionar depois.</small>{registrationRecipe.map((row, index) => <div className="food-assistant-register-recipe-row" key={index}><label>Insumo<select required value={row.ingredientId} onChange={event => setRegistrationRecipe(current => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, ingredientId: event.target.value } : entry))}><option value="">Escolha…</option>{registrationIngredients.map(ingredient => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></label><label>Quantidade<input required type="number" min="1" step="1" value={row.quantity || ""} onChange={event => setRegistrationRecipe(current => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: guidedNumber(event.target.value) } : entry))} /></label><button type="button" className="proto-subtle" onClick={() => setRegistrationRecipe(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remover</button></div>)}<button type="button" className="food-assistant-add-row" disabled={!registrationIngredients.length} onClick={() => setRegistrationRecipe(current => [...current, { ingredientId: "", quantity: 0 }])}>Adicionar insumo</button>{!registrationIngredients.length && <small>Nenhum insumo cadastrado. Você poderá anexá-lo depois.</small>}</details>}
        {registrationMode !== "ingredient" && <div className="food-assistant-register-checks"><label><input type="checkbox" checked={registrationAllowOnDemand} onChange={event => setRegistrationAllowOnDemand(event.target.checked)} /> Aceitar preparo sob demanda</label><label><input type="checkbox" checked={registrationFryToOrder} onChange={event => setRegistrationFryToOrder(event.target.checked)} /> Permitir fritar na hora</label></div>}
        <div className="food-assistant-review"><strong>Resumo</strong><span><b>Produto:</b> {registrationName}</span><span><b>Origem:</b> {registrationMode === "ingredient" ? "Insumo" : registrationMode === "recipe" ? "Feito aqui com insumos" : registrationArrival === "unprepared" ? "Vem cru/congelado para preparar" : "Já vem pronto"}</span><span><b>Preço:</b> {registrationPrice || "não informado"}</span></div>
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
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("Clique aqui e fale várias ações. Você confere tudo antes de registrar.");
  const [drafts, setDrafts] = useState<AssistantDraft[]>([]);
  const [registration, setRegistration] = useState<AssistantRegistrationDraft | null>(null);
  const [pendingRegistrationQuestion, setPendingRegistrationQuestion] = useState<AssistantRegistrationQuestion | null>(null);
  const [pendingStockCommand, setPendingStockCommand] = useState<string | null>(null);
  const [stockQuestion, setStockQuestion] = useState(false);
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<Record<string, string>>({});
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  const timer = useRef<number>();
  const alive = useRef(true);
  const upload = useRef(false);
  const liveRecognition = useRef<LiveSpeechRecognition | null>(null);
  const liveFinalText = useRef("");
  const liveInterimText = useRef("");
  const stopSpeech = useRef(false);
  const speechPrompt = useRef("Mosaico Food. Vendi, comprei, adicionei ao estoque, fritei, assei, preparei, dei baixa, descartei, perda. Pães, pastéis, coxinhas, trufas e salgados.");
  useEffect(() => {
    let active = true;
    void getFoodProducts({ activeOnly: true }).then(products => {
      if (!active) return;
      const names = products.flatMap(product => [product.name, ...product.aliases]).slice(0, 120).join(", ");
      if (names) speechPrompt.current = `${speechPrompt.current} Produtos da loja: ${names}.`.slice(0, 4000);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    alive.current = true;
    const show = () => { setOpen(true); setGuided(true); };
    window.addEventListener("food-open-assistant", show);
    return () => {
      alive.current = false; upload.current = false;
      window.removeEventListener("food-open-assistant", show);
      window.clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      abortLiveSpeech(liveRecognition.current);
      liveRecognition.current = null;
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  async function interpret(nextText = text, productId?: string, skipPending = false) {
    if (!nextText.trim()) return;
    const pending = pendingRegistrationQuestion;
    const pendingStock = pendingStockCommand;
    const preparationAnswer = /\b(pronto|prontos|pronta|prontas|assado|assados|assada|assadas|frito|fritos|frita|fritas|cozido|cozidos|cozida|cozidas|cru|crus|crua|cruas|congelado|congelados|congelada|congeladas|congelos|para\s+(?:fritar|assar|cozinhar|finalizar|preparar)|fritar|assar|cozinhar|finalizar)\b/i.test(nextText);
    const commandText = !skipPending && pendingStock && preparationAnswer
      ? `${pendingStock} ${nextText}`
      : !skipPending && pending && !registrationWords.test(nextText)
      ? pending.kind === "quantity"
        ? `cadastre ${nextText} de ${pending.name ?? ""}`
        : pending.kind === "unit"
          ? `cadastre ${pending.quantity ?? ""} ${nextText} de ${pending.name ?? ""}`
          : pending.quantity && pending.stockUnit
            ? `cadastre ${pending.quantity} ${unitLabel(pending.stockUnit)} de ${nextText}`
            : `cadastre ${nextText}`
      : nextText;
    setBusy(true); setDrafts([]); setChoices([]);
    setRegistration(null); setPendingRegistrationQuestion(null); setStockQuestion(false); setPendingStockCommand(null);
    try {
      let analyzedText = commandText;
      const catalog = await getFoodProducts({ activeOnly: true }).catch(() => []);
      const localInterpretation = await interpretFoodText(commandText, catalog);
      if (localInterpretation.understood && localInterpretation.text) analyzedText = localInterpretation.text;
      const result = await assistantPreview(analyzedText, productId);
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
        setStockQuestion(result.stockQuestion === true);
        if (result.stockQuestion) setPendingStockCommand(nextText);
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
      return { draftId: draft.id, totalCents, paymentMethod: draft.action === "sale" && payments[draft.id] !== "pending" ? payments[draft.id] as "pix" | "cash" | "card" : null };
    });
    if (confirmations.some(item => !Number.isSafeInteger(item.totalCents) || item.totalCents < 0)) { setNotice("Confira os valores das vendas."); return; }
    setBusy(true);
    try {
      const result = await assistantConfirmBatch(confirmations, registration ? [{ draftId: registration.id }] : []);
      setNotice(result.message); setDrafts([]); setRegistration(null); setPendingRegistrationQuestion(null); setPendingStockCommand(null); setStockQuestion(false); setText("");
      window.dispatchEvent(new Event("food-stock-changed"));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível registrar."); }
    finally { setBusy(false); }
  }
  function editTranscription() {
    setDrafts([]);
    setRegistration(null);
    setChoices([]);
    setStockQuestion(false);
    setPendingStockCommand(null);
    setNotice("Edite a transcrição abaixo e toque em Analisar texto novamente. Nada foi registrado ainda.");
    window.setTimeout(() => textArea.current?.focus(), 0);
  }
  function chooseStockState(state: "ready" | "unprepared") {
    const base = pendingStockCommand ?? text;
    if (!base.trim()) return;
    void interpret(`${base} ${state === "ready" ? "pronto" : "para preparar"}`, undefined, true);
  }
  async function record() {
    if (recording) {
      stopSpeech.current = true;
      stopLiveSpeech(liveRecognition.current);
      recorder.current?.stop();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Microfone indisponível. Use o campo de texto.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      stopSpeech.current = false;
      liveFinalText.current = "";
      liveInterimText.current = "";
      setText("");
      setDrafts([]);
      setRegistration(null);
      setChoices([]);
      setStockQuestion(false);
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      let bytes = 0;
      let liveSnapshotBusy = false;
      let liveSnapshotRequestedAt = 0;
      let liveSnapshotText = "";
      upload.current = true;
      capture.ondataavailable = event => {
        bytes += event.data.size;
        if (bytes > 8 * 1024 * 1024) { upload.current = false; setNotice("Áudio muito grande. Grave uma mensagem mais curta."); if (capture.state === "recording") capture.stop(); return; }
        if (event.data.size) chunks.push(event.data);
        if (!liveRecognition.current && !liveSnapshotBusy && Date.now() - liveSnapshotRequestedAt > 3500 && chunks.length > 1) {
          liveSnapshotRequestedAt = Date.now();
          liveSnapshotBusy = true;
          void audioToWav(new Blob(chunks, { type: capture.mimeType }))
            .then(snapshot => transcribeFoodAudio(snapshot, speechPrompt.current))
            .then(snapshot => {
              if (snapshot.understood && snapshot.text && alive.current && capture.state === "recording") {
                liveSnapshotText = snapshot.text;
                setText(snapshot.text);
                setNotice("Transcrição ao vivo… continue falando ou encerre para analisar.");
              }
            })
            .catch(() => undefined)
            .finally(() => { liveSnapshotBusy = false; });
        }
      };
      const live = createLiveSpeechRecognition();
      if (live) {
        live.continuous = true;
        live.interimResults = true;
        live.lang = "pt-BR";
        live.onresult = event => {
          let finalPart = "";
          let interimPart = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (result.isFinal) finalPart += `${result[0].transcript} `;
            else interimPart += `${result[0].transcript} `;
          }
          if (finalPart) liveFinalText.current = `${liveFinalText.current} ${finalPart}`.trim();
          liveInterimText.current = interimPart.trim();
          const visibleText = `${liveFinalText.current} ${liveInterimText.current}`.trim();
          if (visibleText) setText(visibleText);
        };
        live.onerror = () => {
          if (liveRecognition.current === live) liveRecognition.current = null;
        };
        live.onend = () => {
          if (stopSpeech.current || liveRecognition.current !== live) return;
          try { live.start(); } catch { liveRecognition.current = null; }
        };
        try {
          live.start();
          liveRecognition.current = live;
        } catch {
          liveRecognition.current = null;
        }
      }
      capture.onstop = async () => {
        window.clearTimeout(timer.current);
        stopSpeech.current = true;
        stopLiveSpeech(liveRecognition.current);
        liveRecognition.current = null;
        await new Promise(resolve => window.setTimeout(resolve, 180));
        media.getTracks().forEach(track => track.stop());
        if (!alive.current) return;
        setRecording(false);
        if (!upload.current) { setBusy(false); return; }
        const liveText = `${liveFinalText.current} ${liveInterimText.current}`.trim() || liveSnapshotText;
        try {
          setBusy(true);
          setNotice(liveText ? "Conferindo a fala e analisando…" : "Transcrevendo e analisando…");
          const recordingBlob = new Blob(chunks, { type: capture.mimeType });
          const result = await transcribeFoodAudio(await audioToWav(recordingBlob), speechPrompt.current);
          if (!alive.current) return;
          if (result.understood && result.text) {
            setText(result.text);
            setChoices([]);
            setStockQuestion(false);
            await interpret(result.text);
          }
          else if (liveText) {
            setText(liveText);
            await interpret(liveText);
          }
          else {
            const message = result.available === false
            ? "O motor de voz local não está instalado neste pacote. Instale uma versão com o Whisper ou escreva a mensagem."
            : "Desculpa, não consegui entender o que você disse. Pode repetir ou escrever a mensagem?";
            setNotice(message);
          }
        } catch {
          if (alive.current) {
            const message = "Desculpa, não consegui entender o que você disse. Pode repetir ou escrever a mensagem?";
            setNotice(message);
          }
        }
        finally { if (alive.current) setBusy(false); }
      };
      capture.onerror = () => { stopSpeech.current = true; stopLiveSpeech(liveRecognition.current); liveRecognition.current = null; upload.current = false; media.getTracks().forEach(track => track.stop()); setRecording(false); setBusy(false); setNotice("Não consegui gravar. Pode escrever a mensagem?"); };
      recorder.current = capture; capture.start(1000); setRecording(true); setBusy(false); setNotice(liveRecognition.current ? "Ouvindo e transcrevendo ao vivo… Toque em encerrar para analisar." : "Ouvindo… Ao encerrar, vou transcrever e analisar.");
      timer.current = window.setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 115000);
    } catch (error) {
      stopSpeech.current = true;
      stopLiveSpeech(liveRecognition.current);
      liveRecognition.current = null;
      stream.current?.getTracks().forEach(track => track.stop());
      setBusy(false);
      const name = error instanceof DOMException ? error.name : "";
      setNotice(name === "NotAllowedError" || name === "SecurityError"
        ? "O acesso ao microfone foi bloqueado. Autorize o microfone para o Mosaico Food e tente novamente."
        : name === "NotFoundError"
          ? "Nenhum microfone foi encontrado. Conecte um microfone e tente novamente."
          : error instanceof Error ? error.message : "Não foi possível abrir o microfone.");
    }
  }
  const actionLabel = (action: AssistantDraft["action"]) => action === "sale" ? "Venda" : action === "prepare" ? "Preparo / finalização" : action === "loss" ? "Perda / baixa" : action === "receive_unprepared" ? "Entrada para finalizar" : "Entrada pronta";
  const toggleAssistant = () => {
    if (recording) { void record(); return; }
    setOpen(true);
    setGuided(true);
  };
  return <div className="food-assistant prototype">
    {open && <section className="proto-panel food-assistant-panel" aria-label="Assistente da loja">
      <header className="food-assistant-heading"><h2>Assistente da loja</h2><button type="button" className="proto-subtle" disabled={recording || busy} aria-label="Fechar assistente" onClick={() => setOpen(false)}><X size={18} /></button></header>
      {guided ? <GuidedAssistant onUseFreeform={() => setGuided(false)} onStartVoice={() => { setGuided(false); window.setTimeout(() => void record(), 0); }} /> : <>
      <button type="button" className="food-assistant-back proto-subtle" onClick={() => setGuided(true)} disabled={recording || busy}><ArrowLeft size={16} /> Voltar às opções</button>
      <p role="status">{notice}</p>
      <form onSubmit={event => { event.preventDefault(); void interpret(); }}>
        <label>Mensagem para o assistente — você pode editar<textarea ref={textArea} autoFocus rows={3} maxLength={3000} disabled={busy || recording} value={text} placeholder="Adicionei 20 pães no estoque e 10 pastéis" onChange={event => { setText(event.target.value); setDrafts([]); setRegistration(null); setChoices([]); setStockQuestion(false); }} /><small>{recording ? "Transcrição ao vivo: continue falando. Ao encerrar, eu mostro as ações e peço sua confirmação." : "Você pode escrever ou tocar em Falar agora. Depois de analisar, eu mostro o que será feito antes de registrar."}</small></label>
        <div className="proto-toolbar"><button className={`food-assistant-record-button${recording ? " is-recording" : ""}`} type="button" disabled={busy} onClick={() => void record()} aria-pressed={recording} aria-label={recording ? "Terminar gravação" : "Gravar mensagem de voz"}>{recording ? <Square size={22} /> : <Mic size={22} />}<span>{recording ? "Parar gravação" : "Falar agora"}</span></button><button type="submit" disabled={busy || recording || !text.trim()}><Play size={18} /> Mostrar prévia</button></div>
      </form>
      {choices.length > 0 && <div className="food-assistant-choices"><strong>Escolha o produto</strong>{choices.map(choice => <button type="button" key={choice.id} disabled={busy} onClick={() => void interpret(text, choice.id)}>{choice.name}</button>)}</div>}
      {stockQuestion && <div className="food-assistant-choices" aria-label="Estado da entrada no estoque"><strong>Como entrou esse item?</strong><button type="button" disabled={busy} onClick={() => chooseStockState("ready")}>Entrou pronto</button><button type="button" disabled={busy} onClick={() => chooseStockState("unprepared")}>Entrou cru / para preparar</button></div>}
      {registration && <section className="food-assistant-drafts" aria-label="Novo insumo"><header><strong>Confira o novo insumo</strong><small>Ele será criado como insumo e já entrará no estoque.</small></header><article className="proto-ticket"><div><small>Cadastro de insumo</small><strong>{registration.quantity} {unitLabel(registration.stockUnit)} · {registration.name}</strong></div><small>Depois você poderá informar o peso/volume por unidade e anexar este insumo às receitas.</small></article><div className="proto-toolbar"><button type="button" disabled={busy || recording} onClick={() => void confirm()}>{busy ? "Cadastrando…" : "Cadastrar insumo"}</button><button type="button" className="proto-subtle" disabled={busy} onClick={editTranscription}>Editar transcrição</button></div></section>}
      {drafts.length > 0 && <section className="food-assistant-drafts" aria-label="Operações encontradas"><header><strong>Confira antes de registrar</strong><small>{drafts.length} item{drafts.length === 1 ? "" : "s"} na mesma fala</small></header>{drafts.map(draft => <article className="proto-ticket" key={draft.id}><div><small>{actionLabel(draft.action)}</small><strong>{draft.quantity} × {draft.productName}</strong></div>{draft.action === "sale" && <><label>Total da venda (R$)<input disabled={busy} inputMode="decimal" value={totals[draft.id] ?? ""} onChange={event => setTotals(current => ({ ...current, [draft.id]: event.target.value }))} /></label><label>Pagamento<select disabled={busy} value={payments[draft.id] ?? "pending"} onChange={event => setPayments(current => ({ ...current, [draft.id]: event.target.value }))}><option value="pending">Pendente / não informado</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option></select></label></>}</article>)}<div className="proto-toolbar"><button type="button" disabled={busy || recording} onClick={() => void confirm()}>{busy ? "Registrando…" : `Registrar ${drafts.length} operação${drafts.length === 1 ? "" : "ões"}`}</button><button type="button" className="proto-subtle" disabled={busy} onClick={editTranscription}>Editar transcrição</button></div></section>}
      </>}
    </section>}
    <button type="button" className={`food-assistant-toggle${recording ? " is-recording" : ""}`} aria-expanded={open} aria-label={recording ? "Terminar fala do assistente" : "Abrir assistente"} onClick={toggleAssistant}><Wand2 aria-hidden="true" size={27} /><span>{recording ? "Parar e analisar" : "Abrir assistente"}</span></button>
  </div>;
}
