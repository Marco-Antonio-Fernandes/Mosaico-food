import { useEffect, useState } from "react";
import { CheckCircle2, GitBranch, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

type UpdateStatus = Awaited<ReturnType<NonNullable<Window["mosaicoDesktop"]>["checkForUpdates"]>>;

const phaseLabel: Record<string, string> = {
  clone: "Clonando o repositório",
  git: "Baixando alterações do Git",
  deps: "Instalando dependências",
  assets: "Preparando modelos locais",
  build: "Compilando aplicativo e backend",
  package: "Empacotando a nova versão",
  install: "Instalando e reiniciando",
};

const shortCommit = (value: string | null) => value ? value.slice(0, 7) : "—";

export function FoodUpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ phase?: string; message?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const bridge = window.mosaicoDesktop;
    void bridge?.getAppVersion?.().then(setCurrentVersion).catch(() => undefined);
    if (!bridge?.onUpdateProgress) return;
    return bridge.onUpdateProgress(next => setProgress({ phase: next.phase, message: next.message }));
  }, []);

  const check = async () => {
    const bridge = window.mosaicoDesktop;
    if (!bridge?.checkForUpdates) {
      setError("As atualizações estão disponíveis apenas no aplicativo instalado.");
      return;
    }
    setChecking(true);
    setError("");
    setNotice("");
    setStatus(null);
    try {
      const next = await bridge.checkForUpdates();
      setStatus(next);
      if (next.currentCommit) setNotice(next.message);
      else setError(next.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar as atualizações.");
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    const bridge = window.mosaicoDesktop;
    if (!bridge?.installUpdate) return;
    setInstalling(true);
    setError("");
    setNotice("");
    setProgress({ phase: "git", message: "Baixando alterações do Git…" });
    try {
      await bridge.installUpdate();
      setNotice("Atualização aplicada. O Mosaico Food vai reiniciar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar.");
      setInstalling(false);
      setProgress(null);
    }
  };

  const phase = progress?.phase ? phaseLabel[progress.phase] ?? "Atualizando" : "Atualizando";

  return <section className="food-update-panel" aria-live="polite">
    <div className="food-update-header">
      <div className="food-update-icon"><Sparkles size={22} /></div>
      <div>
        <p className="food-backup-eyebrow">Sistema</p>
        <h2>Atualizações</h2>
        <p>O sistema baixa o repositório, instala dependências, compila, empacota e reinicia sozinho.</p>
      </div>
    </div>

    <div className="food-update-current">
      <span>Versão instalada</span>
      <strong>{currentVersion || "—"}</strong>
    </div>

    <div className="food-update-repo">
      <div><GitBranch size={15} /><span>Repositório</span></div>
      <code title={status?.remoteUrl}>{status?.remoteUrl ?? "https://github.com/Marco-Antonio-Fernandes/Mosaico-food.git"}</code>
    </div>
    {status?.sourceDir && <p className="food-update-source">Pasta local: <code>{status.sourceDir}</code></p>}

    {status?.currentCommit && <div className="food-update-commits">
      <span>Instalado: <strong>{shortCommit(status.currentCommit)}</strong></span>
      <span>Repositório: <strong>{shortCommit(status.latestCommit)}</strong>{status.branch ? ` · ${status.branch}` : ""}</span>
      {status.dirty && <span className="food-update-dirty">Há alterações locais na pasta do repositório.</span>}
    </div>}
    {status?.latestSubject && <p className="food-update-notes">Último commit: {status.latestSubject}</p>}

    {installing && <div className="food-update-progress">
      <div className="food-update-progress-label"><LoaderCircle className="food-spin" size={14} />{progress?.message ?? phase}…</div>
      <div className="food-update-progress-track is-indeterminate"><span /></div>
    </div>}

    <div className="food-update-actions">
      <button type="button" className="proto-subtle" onClick={() => void check()} disabled={checking || installing}>{checking ? <LoaderCircle className="food-spin" size={15} /> : <RefreshCw size={15} />}{checking ? "Consultando…" : "Verificar atualizações"}</button>
      {status?.updateAvailable && <button type="button" onClick={() => void install()} disabled={installing}>{installing ? <LoaderCircle className="food-spin" size={15} /> : <GitBranch size={15} />}{installing ? "Atualizando…" : "Atualizar agora"}</button>}
    </div>

    {notice && <p className="food-backup-notice"><CheckCircle2 size={16} />{notice}</p>}
    {error && <p className="food-backup-error"><RefreshCw size={16} />{error}</p>}
  </section>;
}
