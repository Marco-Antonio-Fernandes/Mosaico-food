import { useEffect, useState } from "react";
import { CheckCircle2, FolderOpen, GitBranch, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

type UpdateStatus = Awaited<ReturnType<NonNullable<Window["mosaicoDesktop"]>["checkForUpdates"]>>;

const phaseLabel: Record<string, string> = {
  git: "Baixando alterações do Git",
  deps: "Instalando dependências",
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
  const [choosing, setChoosing] = useState(false);
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
      setNotice(next.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar as atualizações.");
    } finally {
      setChecking(false);
    }
  };

  const choose = async () => {
    const bridge = window.mosaicoDesktop;
    if (!bridge?.chooseUpdateRepository) return;
    setChoosing(true);
    setError("");
    setNotice("");
    try {
      const result = await bridge.chooseUpdateRepository();
      if (result) {
        setNotice(`Repositório selecionado: ${result.repoPath}`);
        await check();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível escolher a pasta do repositório.");
    } finally {
      setChoosing(false);
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
        <p>O sistema busca as mudanças no Git, instala as dependências, compila e reinicia com a versão nova.</p>
      </div>
    </div>

    <div className="food-update-current">
      <span>Versão instalada</span>
      <strong>{currentVersion || "—"}</strong>
    </div>

    <div className="food-update-repo">
      <div><GitBranch size={15} /><span>Repositório</span></div>
      <code title={status?.repoPath ?? undefined}>{status?.repoPath ?? "Nenhum repositório selecionado"}</code>
      <button type="button" className="proto-subtle" onClick={() => void choose()} disabled={choosing || installing}>{choosing ? <LoaderCircle className="food-spin" size={14} /> : <FolderOpen size={14} />}Escolher pasta</button>
    </div>

    {status?.repoPath && <div className="food-update-commits">
      <span>Instalado: <strong>{shortCommit(status.currentCommit)}</strong></span>
      <span>Repositório: <strong>{shortCommit(status.latestCommit)}</strong>{status.branch ? ` · ${status.branch}` : ""}</span>
      {status.dirty && <span className="food-update-dirty">Há alterações locais no repositório.</span>}
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
