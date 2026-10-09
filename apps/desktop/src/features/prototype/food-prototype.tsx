import { useState, type DragEvent } from "react";
import { GripVertical } from "lucide-react";
import { Badge, Chat, Editor, Metrics, NotificationList, OfflinePreview, Panel, Preferences, Records, Tabs, type RecordItem } from "@/components/shared/prototype-kit";

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
const products = [
  { id: "burger", name: "Hambúrguer da casa", group: "Lanches", price: 28, icon: "🍔" },
  { id: "fries", name: "Batata crocante", group: "Porções", price: 16, icon: "🍟" },
  { id: "cola", name: "Refrigerante cola", group: "Bebidas", price: 7, icon: "🥤" },
  { id: "juice", name: "Suco de laranja", group: "Bebidas", price: 9, icon: "🍊" },
  { id: "combo", name: "Combo da casa", group: "Combos", price: 45, icon: "🍽️" },
  { id: "cake", name: "Fatia de bolo", group: "Sobremesas", price: 12, icon: "🍰" },
];
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    {module === "service" && <Chat />}
    {module === "inventory" && <Inventory />}
    {module === "customers" && <Customers />}
    {module === "finance" && <Finance />}
    {module === "fiscal" && <Fiscal />}
    {module === "notifications" && <NotificationList />}
    {module === "offline" && <OfflinePreview />}
    {module === "automation" && <div className="proto-stack"><Preferences groups={[{ title: "Atendimento automático", labels: ["Automação habilitada", "Pausar ao assumir atendimento", "Pedir confirmação antes do pedido"] }, { title: "Entrega e retirada", labels: ["Oferecer retirada", "Oferecer delivery", "Avisar quando o pedido estiver pronto"] }]} /><Editor title="Mensagens da loja" tabs={["Boas-vindas", "Fora do expediente", "Confirmação", "Status do pedido"]} labels={["Horário de abertura", "Horário de fechamento", "Tempo do carrinho (min)"]} initialText="Olá! Bem-vindo ao Mosaico Food. O que você gostaria de pedir hoje?" /></div>}
    {module === "settings" && <div className="proto-stack"><Editor title="Identidade da loja" tabs={["Dados da loja", "Entrega", "Impressão"]} labels={["Nome da loja", "Endereço", "Telefone público"]} /><Preferences groups={[{ title: "Equipe e acesso", labels: ["Operador de caixa", "Gerente", "Responsável fiscal"] }, { title: "Notificações", labels: ["Som de novo pedido", "Aviso de WhatsApp", "Alertas de estoque"] }]} /><Panel title="Integrações"><dl className="proto-facts"><div><dt>WhatsApp Cloud API</dt><dd>Não conectado</dd></div><div><dt>Fiscal</dt><dd>Configuração pendente</dd></div></dl></Panel></div>}
  </div>;
}
function Catalog({ pos = false }: { pos?: boolean }) {
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const selected = products.filter(product => cart[product.id]);
  const total = selected.reduce((sum, product) => sum + product.price * cart[product.id], 0);
  return <div className="proto-stack"><Tabs items={["Todos", "Lanches", "Porções", "Bebidas", "Combos", "Sobremesas"]} value={category} onChange={setCategory} />
    <div className="proto-toolbar"><label>Buscar no catálogo<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Produto, categoria ou alias…" /></label>{!pos && <button type="button" onClick={() => setEditing(!editing)}>Cadastrar produto</button>}</div>
    {editing && <Editor title="Cadastro de produto" tabs={["Produto", "Adicionais e opções", "Aliases", "Ficha técnica", "Perfil fiscal"]} labels={["Nome", "Categoria", "Preço", "Unidade"]} />}
    <div className={pos ? "proto-two" : ""}><div className="proto-three">{products.filter(product => (category === "Todos" || category === product.group) && product.name.toLowerCase().includes(search.toLowerCase())).map(product => <article key={product.id} className="proto-product"><div className="proto-product-art" aria-hidden="true">{product.icon}</div><small>{product.group}</small><h3>{product.name}</h3><strong>{money(product.price)}</strong><Badge>Disponível</Badge><button type="button" onClick={() => pos ? setCart({ ...cart, [product.id]: (cart[product.id] ?? 0) + 1 }) : setNotice("Produto selecionado: " + product.name)}>{pos ? "Adicionar à venda" : "Ver cadastro"}</button></article>)}</div>
      {pos && <Panel title="Venda de balcão" subtitle="Carrinho de venda"><label>Cliente<select><option>Consumidor final</option><option>Ana Oliveira</option></select></label><div className="proto-stack" style={{ marginTop: 16 }}>{selected.map(product => <div className="proto-ticket" key={product.id}><strong>{product.name}</strong><div className="proto-toolbar"><button type="button" aria-label={"Diminuir " + product.name} onClick={() => setCart({ ...cart, [product.id]: Math.max(0, cart[product.id] - 1) })}>−</button><span>{cart[product.id]}</span><button type="button" aria-label={"Aumentar " + product.name} onClick={() => setCart({ ...cart, [product.id]: cart[product.id] + 1 })}>+</button><strong>{money(product.price * cart[product.id])}</strong></div></div>)}</div>{!selected.length && <p className="proto-empty">Selecione os produtos ao lado.</p>}<dl className="proto-facts"><div><dt>Total</dt><dd>{money(total)}</dd></div></dl><label>Pagamento<select><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Crediário</option></select></label><div className="proto-toolbar"><button type="button" disabled={!selected.length} onClick={() => { setNotice("Venda finalizada."); setCart({}); }}>Finalizar venda</button></div></Panel>}
    </div><p role="status">{notice}</p>
  </div>;
}
type FoodOrder = {
  id: string;
  stage: number;
  items: string;
  channel: string;
  payment: string;
  total: string;
};

function Orders() {
  const stages = ["Recebido", "Em preparo", "Pronto", "Em trânsito", "Entregue"];
  const [orders, setOrders] = useState<FoodOrder[]>([
    { id: "1042", stage: 0, items: "2 hambúrgueres · 1 batata", channel: "WhatsApp", payment: "Pendente", total: "R$ 72,00" },
    { id: "1043", stage: 1, items: "1 combo da casa", channel: "Balcão", payment: "Pago", total: "R$ 45,00" },
    { id: "1044", stage: 2, items: "1 hambúrguer · 1 refrigerante", channel: "Retirada", payment: "Pendente", total: "R$ 35,00" },
  ]);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("Segure um pedido e arraste-o para outra etapa.");

  function moveOrder(orderId: string, stage: number) {
    const order = orders.find(item => item.id === orderId);
    if (!order || order.stage === stage) return;

    setOrders(current => current.map(item => item.id === orderId ? { ...item, stage } : item));
    setStatusMessage(`Pedido #${orderId} movido para ${stages[stage]}.`);
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

  return <><p className="sr-only" role="status">{statusMessage}</p><div className="proto-orders-board">{stages.map((stage, stageIndex) => { const stageOrders = orders.filter(order => order.stage === stageIndex); return <Panel key={stage} title={stage} subtitle={stageOrders.length + " pedidos"}><div className={`order-dropzone${dragOverStage === stageIndex ? " is-drag-over" : ""}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stageIndex); }} onDragLeave={() => setDragOverStage(current => current === stageIndex ? null : current)} onDrop={event => handleDrop(event, stageIndex)}>{stageOrders.map(order => <article aria-label={`Pedido ${order.id}. Segure e arraste para mudar de etapa.`} className={`proto-ticket order-card${draggedOrderId === order.id ? " is-dragging" : ""}`} draggable onDragEnd={() => { setDraggedOrderId(null); setDragOverStage(null); }} onDragStart={event => handleDragStart(event, order.id)} key={order.id}><div className="order-card-grab"><GripVertical aria-hidden="true" size={18} />Segure e arraste</div><div><Badge>{order.channel}</Badge><h3>#{order.id}</h3></div><p>{order.items}</p><strong>{order.total}</strong><small>Pagamento: {order.payment}</small></article>)}{!stageOrders.length && <div className="order-dropzone-empty"><span>Solte aqui</span><small>Arraste um pedido para esta etapa</small></div>}</div></Panel>; })}</div></>;
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
