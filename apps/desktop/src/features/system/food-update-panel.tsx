import { useEffect, useState } from "react";
import { CheckCircle2, DownloadCloud, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

type UpdateStatus = Awaited<ReturnType<NonNullable<Window["mosaicoDesktop"]>["checkForUpdates"]>>;

const phaseLabel: Record<string, string> = {
  downloading: "Baixando atualização",
  verifying: "Verificando o arquivo",
  extracting: "Preparando a nova versão",
  installing: "Instalando",
};

export function FoodUpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ percent: number | null; phase?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const bridge = window.mosaicoDesktop;
    void bridge?.getAppVersion?.().then(setCurrentVersion).catch(() => undefined);
    if (!bridge?.onUpdateProgress) return;
    return bridge.onUpdateProgress(next => setProgress({ percent: next.percent, phase: next.phase }));
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
      setCurrentVersion(next.currentVersion);
      setNotice(next.updateAvailable ? `Nova versão ${next.latestVersion} disponível.` : "Você já está na versão mais recente.");
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
    setProgress({ percent: null, phase: "downloading" });
    try {
      await bridge.installUpdate();
      setNotice("Atualização aplicada. O Mosaico Food vai reiniciar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível instalar a atualização.");
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
        <p>Consulte o servidor e instale a versão mais recente sem precisar de pendrive.</p>
      </div>
    </div>
    <div className="food-update-current">
      <span>Versão instalada</span>
      <strong>{currentVersion || "—"}</strong>
    </div>
    {installing && <div className="food-update-progress">
      <div className="food-update-progress-label">{phase}{progress?.percent != null ? ` · ${progress.percent}%` : "…"}</div>
      <div className="food-update-progress-track"><span style={{ width: `${progress?.percent ?? 15}%` }} /></div>
    </div>}
    <div className="food-update-actions">
      <button type="button" className="proto-subtle" onClick={() => void check()} disabled={checking || installing}>{checking ? <LoaderCircle className="food-spin" size={15} /> : <RefreshCw size={15} />}{checking ? "Consultando…" : "Verificar atualizações"}</button>
      {status?.updateAvailable && <button type="button" onClick={() => void install()} disabled={installing}>{installing ? <LoaderCircle className="food-spin" size={15} /> : <DownloadCloud size={15} />}{installing ? "Atualizando…" : `Atualizar para ${status.latestVersion}`}</button>}
    </div>
    {status?.notes && <p className="food-update-notes">{status.notes}</p>}
    {notice && <p className="food-backup-notice"><CheckCircle2 size={16} />{notice}</p>}
    {error && <p className="food-backup-error"><RefreshCw size={16} />{error}</p>}
  </section>;
}
