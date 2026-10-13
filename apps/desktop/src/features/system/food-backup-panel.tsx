import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FolderOpen, HardDrive, LoaderCircle, RefreshCw, ShieldCheck, Upload } from "lucide-react";

import { exportFoodBackup, importFoodBackup, type FoodBackup } from "@/lib/food-api";

type BackupSettings = { folder: string | null; lastBackupAt: string | null };

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "Ainda não realizado";

function isBackup(value: unknown): value is FoodBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Record<string, unknown>;
  return backup.format === "mosaico-food-backup"
    && backup.version === 1
    && typeof backup.exportedAt === "string"
    && backup.tables !== null
    && typeof backup.tables === "object";
}

function downloadBackup(content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mosaico-food-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FoodBackupPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<BackupSettings>({ folder: null, lastBackupAt: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    const next = await window.mosaicoDesktop?.getBackupSettings().catch(() => undefined);
    if (next) setSettings(next);
  };

  useEffect(() => {
    void refresh();
    const onBackup = () => void refresh();
    window.addEventListener("food-backup-updated", onBackup);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.removeEventListener("food-backup-updated", onBackup);
      window.clearInterval(timer);
    };
  }, []);

  const chooseFolder = async () => {
    if (!window.mosaicoDesktop) {
      setError("A escolha automática de pasta está disponível no aplicativo instalado.");
      return;
    }
    try {
      setError("");
      const next = await window.mosaicoDesktop.chooseBackupFolder();
      if (next) {
        setSettings(next);
        setNotice("Pasta definida. O próximo backup automático será salvo nela.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível escolher a pasta.");
    }
  };

  const exportNow = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const backup = await exportFoodBackup();
      const content = `${JSON.stringify(backup, null, 2)}\n`;
      if (window.mosaicoDesktop) {
        let folder = settings.folder;
        if (!folder) {
          const next = await window.mosaicoDesktop.chooseBackupFolder();
          if (!next?.folder) throw new Error("Escolha uma pasta para salvar o backup.");
          folder = next.folder;
          setSettings(next);
        }
        const saved = await window.mosaicoDesktop.writeBackupFile({ folder, content });
        setNotice(`Backup salvo em ${saved.path}`);
        await refresh();
      } else {
        downloadBackup(content);
        setNotice("Backup exportado pelo navegador.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exportar o backup.");
    } finally {
      setBusy(false);
    }
  };

  const importContent = async (content: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const parsed: unknown = JSON.parse(content);
      if (!isBackup(parsed)) throw new Error("Esse arquivo não é um backup válido do Mosaico Food.");
      const result = await importFoodBackup(parsed);
      setNotice(`Importação concluída: ${result.summary.inserted} novos, ${result.summary.updated} atualizados e ${result.summary.skipped} ignorados. O sistema será recarregado.`);
      window.dispatchEvent(new Event("food-stock-changed"));
      window.setTimeout(() => window.location.reload(), 900);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar o backup.");
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    if (window.mosaicoDesktop) {
      setBusy(true);
      try {
        const selected = await window.mosaicoDesktop.readBackupFile();
        if (selected) await importContent(selected.content);
        else setBusy(false);
      } catch (cause) {
        setBusy(false);
        setError(cause instanceof Error ? cause.message : "Não foi possível abrir o backup.");
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const statusLabel = settings.folder ? settings.folder : "Nenhuma pasta escolhida";

  return <section className="food-backup-panel" aria-live="polite">
    <div className="food-backup-hero">
      <div className="food-backup-hero-icon"><ShieldCheck size={25} /></div>
      <div><p className="food-backup-eyebrow">Proteção dos dados</p><h2>Backup e restauração</h2><p>Produtos, sabores, estoque, vendas, pedidos, clientes e configurações ficam protegidos em um arquivo completo.</p></div>
    </div>
    <div className="food-backup-grid">
      <article className="food-backup-card"><div className="food-backup-card-title"><FolderOpen size={18} /><strong>Pasta automática</strong></div><p>Enquanto o sistema estiver aberto, um backup será criado a cada 3 horas na pasta escolhida.</p><code title={statusLabel}>{statusLabel}</code><button type="button" className="proto-subtle" disabled={busy} onClick={() => void chooseFolder()}><FolderOpen size={15} />{settings.folder ? "Alterar pasta" : "Escolher pasta"}</button></article>
      <article className="food-backup-card"><div className="food-backup-card-title"><HardDrive size={18} /><strong>Último backup</strong></div><p>O arquivo mais recente é salvo sem substituir os anteriores, para você manter histórico.</p><strong className="food-backup-date">{formatDate(settings.lastBackupAt)}</strong><button type="button" disabled={busy} onClick={() => void exportNow()}><Download size={15} />{busy ? "Processando…" : "Exportar agora"}</button></article>
    </div>
    <div className="food-backup-actions"><div><strong>Restaurar um arquivo</strong><small>Os registros são reconciliados por ID e identificadores únicos. Importar o mesmo arquivo novamente não duplica os dados.</small></div><button type="button" className="proto-subtle" disabled={busy} onClick={() => void importBackup()}><Upload size={15} />{busy ? "Importando…" : "Importar backup"}</button><input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void file.text().then(importContent); }} /></div>
    {notice && <p className="food-backup-notice"><CheckCircle2 size={16} />{notice}</p>}
    {error && <p className="food-backup-error"><RefreshCw size={16} />{error}</p>}
  </section>;
}
