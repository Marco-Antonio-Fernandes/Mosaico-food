"use client";

import { useState, type ReactNode } from "react";

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="proto-panel"><header><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</header>{children}</section>;
}
export function Metrics({ items }: { items: [string, string, string][] }) {
  return <div className="proto-metrics">{items.map(([label, value, detail]) => <article key={label}><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>)}</div>;
}
export function Tabs({ items, value, onChange }: { items: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="proto-tabs" role="group" aria-label="Visualização">{items.map(item => <button type="button" aria-pressed={item === value} key={item} onClick={() => onChange(item)}>{item}</button>)}</div>;
}
export function Badge({ children }: { children: ReactNode }) { return <span className="proto-badge">{children}</span>; }

export type MockRecord = { id: string; name: string; detail: string; status: string; value: string };
export function Records({ title, rows: initial, fields = ["Nome", "Detalhes", "Situação", "Referência"], action = "Novo registro" }: { title: string; rows: MockRecord[]; fields?: string[]; action?: string }) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MockRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState("Todos");
  const statuses = ["Todos", ...new Set(rows.map(row => row.status))];
  const filtered = rows.filter(row => (status === "Todos" || row.status === status) && (row.name + row.detail).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <Panel title={title} subtitle="Selecione uma linha para visualizar o detalhe.">
    <div className="proto-toolbar">
      <label>Buscar<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou referência…" /></label>
      <label>Situação<select value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(item => <option key={item}>{item}</option>)}</select></label>
      <button type="button" onClick={() => { setCreating(!creating); setSelected(null); }}>{action}</button>
    </div>
    {creating && <form className="proto-form" onSubmit={event => { event.preventDefault(); if (!name.trim()) return; setRows(current => [{ id: crypto.randomUUID(), name, detail, status: "Rascunho", value: "Prévia local" }, ...current]); setName(""); setDetail(""); setCreating(false); }}>
      <label>{fields[0]}<input required value={name} onChange={event => setName(event.target.value)} maxLength={100} /></label>
      <label>{fields[1]}<input value={detail} onChange={event => setDetail(event.target.value)} maxLength={150} /></label>
      <button type="submit">Adicionar à demonstração</button>
    </form>}
    <div className="proto-table-wrap"><table><thead><tr>{fields.map(field => <th key={field}>{field}</th>)}<th>Ação</th></tr></thead>
      <tbody>{filtered.map(row => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.detail}</td><td><Badge>{row.status}</Badge></td><td>{row.value}</td><td><button type="button" className="proto-subtle" onClick={() => setSelected(row)}>Detalhes</button></td></tr>)}</tbody>
    </table></div>
    {!filtered.length && <p className="proto-empty">Nenhum resultado para este filtro.</p>}
    {selected && <div className="proto-detail"><div className="proto-toolbar"><h3>{selected.name}</h3><button type="button" className="proto-subtle" onClick={() => setSelected(null)}>Fechar detalhe</button></div><p>{selected.detail}</p><p><Badge>{selected.status}</Badge> · {selected.value}</p><p className="proto-caption">Registro fictício. Alterações reais serão ligadas ao módulo responsável.</p></div>}
  </Panel>;
}

export function Editor({ title, tabs, labels, initialText = "" }: { title: string; tabs: string[]; labels: string[]; initialText?: string }) {
  const [tab, setTab] = useState(tabs[0]);
  const [drafts, setDrafts] = useState<Record<string, string>>({ [tabs[0]]: initialText });
  const [saved, setSaved] = useState("");
  return <Panel title={title} subtitle="Rascunho de demonstração · alterações apenas nesta tela">
    <Tabs items={tabs} value={tab} onChange={setTab} />
    <div className="proto-form">{labels.map(label => <label key={label}>{label}<input placeholder={label} /></label>)}</div>
    <label className="proto-editor-label">{tab}<textarea rows={9} value={drafts[tab] ?? ""} onChange={event => { setDrafts({ ...drafts, [tab]: event.target.value }); setSaved(""); }} placeholder={"Escreva aqui: " + tab.toLowerCase()} /></label>
    <div className="proto-toolbar"><button type="button" onClick={() => setSaved("Rascunho mantido apenas nesta prévia.")}>Salvar rascunho mock</button><span role="status">{saved}</span></div>
  </Panel>;
}

export function Chat({ health = false }: { health?: boolean }) {
  const people = health ? ["Paciente exemplo A", "Paciente exemplo B", "Paciente exemplo C"] : ["Cliente exemplo A", "Cliente exemplo B", "Cliente exemplo C"];
  const [person, setPerson] = useState(people[0]);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<Record<string, string[]>>({});
  return <div className="proto-chat">
    <Panel title="Conversas" subtitle="Mensagens demonstrativas"><div className="proto-conversations">{people.map((name, index) => <button type="button" key={name} aria-pressed={person === name} onClick={() => { setPerson(name); setDraft(""); }}><strong>{name}</strong><small>{index === 0 ? "Nova mensagem · agora" : "Em acompanhamento"}</small></button>)}</div></Panel>
    <Panel title={person} subtitle={health ? "Comunicação administrativa autorizada" : manual ? "Atendimento humano · automação pausada" : "Assistente automático · modo visual"}>
      {!health && <button type="button" className="proto-subtle" onClick={() => setManual(!manual)}>{manual ? "Devolver à automação" : "Assumir atendimento"}</button>}
      <div className="proto-messages"><p>{health ? "Olá! Gostaria de confirmar o horário de amanhã." : "Olá! Quero um hambúrguer e um refrigerante para retirar."}</p><p className="outgoing">{health ? "Seu horário de exemplo está reservado para 09h. Podemos confirmar?" : "Claro! Vamos conferir o carrinho antes de confirmar o pedido."}</p>{(threads[person] ?? []).map((text, i) => <p className="outgoing" key={i}>{text}<small>Mensagem local · não enviada</small></p>)}</div>
      <form className="proto-toolbar" onSubmit={event => { event.preventDefault(); if (!draft.trim()) return; setThreads({ ...threads, [person]: [...(threads[person] ?? []), draft] }); setDraft(""); }}><label>Mensagem<input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escreva uma mensagem…" required /></label><button type="submit">Simular envio</button></form>
    </Panel>
    <Panel title={health ? "Confirmação e consentimento" : "Carrinho da conversa"} subtitle={health ? "Somente data, horário e orientações administrativas" : "Aguardando confirmação explícita"}>
      <dl className="proto-facts">{(health ? [["Consentimento", "Autorizado · exemplo"], ["Agenda", "Amanhã · 09h"], ["Resposta", "Pendente"], ["Conteúdo clínico", "Não compartilhado"]] : [["Hambúrguer", "1 × R$ 28,00"], ["Refrigerante", "1 × R$ 7,00"], ["Modalidade", "Retirada"], ["Pagamento", "Pendente"], ["Pedido oficial", "Ainda não criado"]]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </Panel>
  </div>;
}

export function Preferences({ groups }: { groups: { title: string; labels: string[] }[] }) {
  const [saved, setSaved] = useState(false);
  return <form className="proto-stack" onSubmit={event => { event.preventDefault(); setSaved(true); }}>
    <div className="proto-two">{groups.map(group => <Panel key={group.title} title={group.title}><div className="proto-stack">{group.labels.map(label => <label className="proto-switch" key={label}><span>{label}</span><input type="checkbox" defaultChecked={false} onChange={() => setSaved(false)} /></label>)}</div></Panel>)}</div>
    <div className="proto-toolbar"><button type="submit">Salvar preferências mock</button><span role="status">{saved ? "Preferências aplicadas somente nesta tela." : "Escolha as opções para experimentar o layout."}</span></div>
  </form>;
}

export function NotificationList({ health = false }: { health?: boolean }) {
  const [read, setRead] = useState<string[]>([]);
  const entries = health ? ["Próxima sessão em 30 minutos", "Confirmação de horário recebida", "Pedido de reagendamento", "Recebimento aguardando identificação", "Conflito de sincronização para revisar"] : ["Novo pedido recebido", "WhatsApp aguardando atendimento", "Pedido pronto para retirada", "Ingrediente próximo do estoque mínimo", "Documento fiscal aguardando revisão"];
  return <Panel title="Central de notificações" subtitle="Exemplos visuais · nenhum evento real">
    <div className="proto-toolbar"><Badge>{entries.length - read.length} não lidas</Badge><button type="button" onClick={() => setRead(entries)}>Marcar todas como lidas</button></div>
    <div className="proto-stack">{entries.map((entry, i) => <article className="proto-notification" key={entry}><span className="proto-avatar">{i + 1}</span><div><strong>{entry}</strong><p>{i === 0 ? "Agora" : i * 5 + " min atrás"} · exemplo</p></div><button type="button" className="proto-subtle" disabled={read.includes(entry)} onClick={() => setRead([...read, entry])}>{read.includes(entry) ? "Lida" : "Marcar lida"}</button></article>)}</div>
  </Panel>;
}

export function OfflinePreview({ health = false }: { health?: boolean }) {
  const [synced, setSynced] = useState(false);
  const [resolved, setResolved] = useState(false);
  return <div className="proto-stack"><Metrics items={[["Fila local", synced ? "0" : "3", "Operações de exemplo"], ["Conflitos", resolved ? "0" : "1", "Revisão manual"], ["Instalação", health ? "Linux" : "Desktop", "Prévia do funcionamento offline"]]} />
    <div className="proto-two"><Panel title="Cópia local" subtitle="Planejamento do armazenamento"><p>Seleção de pasta, criptografia e sincronização serão conectadas na implementação real.</p><ul className="proto-list">{(health ? ["Contatos autorizados", "Horários e confirmações", "Preferências", "Referências de documentos"] : ["Clientes", "Lançamentos de crediário", "Saldo confirmado", "Operações pendentes"]).map(item => <li key={item}>{item}</li>)}</ul><button type="button" onClick={() => setSynced(true)}>Simular sincronização</button><p role="status">{synced ? "Simulação concluída; nenhum dado foi enviado." : "Fila demonstrativa aguardando conexão."}</p></Panel>
    <Panel title="Revisão de conflito" subtitle="Versão local e versão do servidor"><dl className="proto-facts"><div><dt>Local · versão 3</dt><dd>{health ? "Horário: 10h" : "Pagamento pendente: R$ 30"}</dd></div><div><dt>Servidor · versão 4</dt><dd>{health ? "Horário: 11h" : "Pagamento registrado: R$ 30"}</dd></div></dl><button type="button" onClick={() => setResolved(true)} disabled={resolved}>Manter versão do servidor na prévia</button><p role="status">{resolved ? "Conflito resolvido apenas na demonstração." : "Nenhuma versão será sobrescrita automaticamente."}</p></Panel></div></div>;
}
