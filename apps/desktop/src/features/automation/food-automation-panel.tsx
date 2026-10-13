import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Power, RefreshCw, TriangleAlert } from "lucide-react";

type AutomationStatus = {
  enabled: boolean;
  baseUrl: string;
  sessionId: string | null;
  configured: boolean;
  webhookConfigured: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

type AutomationRun = {
  processedMessages: number;
  repliesSent: number;
  ordersCreated: number;
  errors: string[];
};

const apiBaseUrl = (import.meta.env.VITE_MOSAICO_REMOTE_BACKEND_URL || import.meta.env.VITE_MOSAICO_BACKEND_URL || "https://mosaico.rotatix.com.br").replace(/\/$/, "");
const apiKey = import.meta.env.VITE_MOSAICO_API_KEY || "";

async function automationApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload
      ? (payload.error as { message?: string } | string)
      : null;
    const message = typeof error === "string" ? error : error?.message;
    throw new Error(message || "Não foi possível acessar a automação.");
  }
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error("A resposta do backend não corresponde ao contrato esperado.");
  }
  return (payload as { data: T }).data;
}

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "Ainda não executado";

export function FoodAutomationPanel() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [lastRun, setLastRun] = useState<AutomationRun | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const runningRef = useRef(false);

  const run = async (enabled: boolean) => {
    if (!enabled || runningRef.current) return;
    runningRef.current = true;
    try {
      const result = await automationApi<AutomationRun>("/api/v1/food-automation/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setLastRun(result);
      setError(result.errors[0] || "");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Falha ao executar a automação.");
    } finally {
      runningRef.current = false;
    }
  };

  const refresh = async () => {
    try {
      const nextStatus = await automationApi<AutomationStatus>("/api/v1/food-automation/status");
      setStatus(nextStatus);
      setError(nextStatus.lastError || "");
      await run(nextStatus.enabled);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Backend indisponível.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const toggle = async () => {
    if (!status) return;
    try {
      setBusy(true);
      const nextStatus = await automationApi<AutomationStatus>("/api/v1/food-automation/config", {
        method: "PATCH",
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      setStatus(nextStatus);
      setError("");
      await run(nextStatus.enabled);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Não foi possível alterar a automação.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="space-y-4" aria-live="polite">
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
      <article className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-200">Atendimento sem chat</p>
            <h2 className="mt-2 text-xl font-bold text-ink">Atendente automático do WhatsApp</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">O sistema recebe mensagens pelo webhook do WA-AKG, consulta o catálogo e o estoque do Mosaico, responde pelo mesmo WhatsApp e só cria o pedido depois de uma confirmação explícita.</p>
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${status?.enabled ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-line bg-canvas text-muted"}`}>
            {status?.enabled ? "Ativo" : "Pausado"}
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-canvas p-3"><span className="text-xs text-muted">Estoque</span><strong className="mt-1 block text-sm text-ink">Consulta real</strong></div>
          <div className="rounded-xl border border-line bg-canvas p-3"><span className="text-xs text-muted">Variações</span><strong className="mt-1 block text-sm text-ink">Reconhecidas</strong></div>
          <div className="rounded-xl border border-line bg-canvas p-3"><span className="text-xs text-muted">Confirmação</span><strong className="mt-1 block text-sm text-ink">Obrigatória</strong></div>
          <div className="rounded-xl border border-line bg-canvas p-3"><span className="text-xs text-muted">Pedido</span><strong className="mt-1 block text-sm text-ink">Com endereço</strong></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || !status} onClick={() => void toggle()} type="button">
            <Power aria-hidden="true" size={16} />{status?.enabled ? "Pausar atendimento" : "Ativar atendimento"}
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || !status?.enabled} onClick={() => void refresh()} type="button">
            <RefreshCw aria-hidden="true" size={16} />Executar agora
          </button>
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-ink"><CheckCircle2 className="text-emerald-300" size={18} /> Conexão WA-AKG</div>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-3 border-b border-line pb-3"><dt className="text-muted">Servidor</dt><dd className="max-w-[13rem] truncate text-right text-ink">{status?.baseUrl || "—"}</dd></div>
          <div className="flex justify-between gap-3 border-b border-line pb-3"><dt className="text-muted">Sessão</dt><dd className="text-right text-ink">{status?.sessionId || "—"}</dd></div>
          <div className="flex justify-between gap-3 border-b border-line pb-3"><dt className="text-muted">Envio</dt><dd className="text-right text-ink">{status?.configured ? "Pronto" : "Pendente"}</dd></div>
          <div className="flex justify-between gap-3 border-b border-line pb-3"><dt className="text-muted">Webhook</dt><dd className="text-right text-ink">{status?.webhookConfigured ? "Configurado" : "Pendente"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Última execução</dt><dd className="text-right text-ink">{formatDate(status?.lastRunAt || null)}</dd></div>
        </dl>
      </article>
    </div>

    <article className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-bold text-ink"><LoaderCircle className={status?.enabled ? "animate-spin text-brand-400" : "text-muted"} size={18} />Como o teste funciona</div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {["Envie uma mensagem para o WhatsApp conectado à sessão do Mosaico.", "Pode escrever quantidade, produto e sabor na mesma mensagem; o catálogo interpreta as variações.", "O catálogo e o estoque são consultados antes da resposta, inclusive a opção de preparar na hora.", "Responda SIM quando a loja puder preparar ou confirmar.", "Na entrega, envie rua, número e bairro; o endereço fica no pedido."].map((text, index) => <div className="rounded-xl border border-line bg-canvas p-3 text-sm leading-5 text-muted" key={text}><span className="mb-2 flex size-6 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-300">{index + 1}</span>{text}</div>)}
      </div>
      {lastRun && <p className="mt-4 text-sm text-muted">Última rodada: {lastRun.processedMessages} mensagem(ns) processada(s), {lastRun.repliesSent} resposta(s) enviada(s) e {lastRun.ordersCreated} pedido(s) criado(s).</p>}
      {error && <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100"><TriangleAlert className="mt-0.5 shrink-0" size={16} />{error}</p>}
    </article>
  </section>;
}
