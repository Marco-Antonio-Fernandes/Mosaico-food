import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Database, Download, LoaderCircle, RefreshCw, ShieldCheck, Upload } from "lucide-react";

import { exportFoodBackup, importFoodBackup, type FoodBackup } from "@/lib/food-api";

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
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    const next = await window.mosaicoDesktop?.getBackupSettings().catch(() => undefined);
    if (next) setLastBackupAt(next.lastBackupAt);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const exportNow = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const backup = await exportFoodBackup();
      const content = `${JSON.stringify(backup, null, 2)}\n`;
      if (window.mosaicoDesktop) {
        const saved = await window.mosaicoDesktop.saveBackupFile({ content });
        if (!saved) {
          setNotice("Backup cancelado.");
          return;
        }
        setLastBackupAt(saved.createdAt);
        setNotice(`Backup salvo em ${saved.path}`);
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

  const createNewDatabase = async () => {
    if (!window.mosaicoDesktop) {
      setError("Criar um banco novo está disponível no aplicativo instalado.");
      return;
    }
    if (!window.confirm("Criar um banco novo e zerar a loja? O banco atual será arquivado antes da troca.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await window.mosaicoDesktop.createNewDatabase();
      setNotice(`Banco novo criado. O banco anterior foi arquivado${result.archivePath ? ` em ${result.archivePath}` : ""}. O sistema será recarregado.`);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar um banco novo.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="food-backup-panel" aria-live="polite">
    <div className="food-backup-hero">
      <div className="food-backup-hero-icon"><ShieldCheck size={25} /></div>
      <div><p className="food-backup-eyebrow">Proteção dos dados</p><h2>Backup e restauração</h2><p>Clique em fazer backup e escolha onde salvar o arquivo. Produtos, estoque, vendas, pedidos, clientes e configurações vão juntos.</p></div>
    </div>
    <div className="food-backup-grid food-backup-grid-simple">
      <article className="food-backup-card">
        <div className="food-backup-card-title"><Download size={18} /><strong>Fazer backup</strong></div>
        <p>Você escolhe a pasta e o nome do arquivo a cada backup.</p>
        <button type="button" disabled={busy} onClick={() => void exportNow()}>{busy ? <LoaderCircle className="food-spin" size={15} /> : <Download size={15} />}{busy ? "Gerando…" : "Fazer backup"}</button>
      </article>
      <article className="food-backup-card">
        <div className="food-backup-card-title"><Upload size={18} /><strong>Restaurar</strong></div>
        <p>Os registros são reconciliados por ID, então importar o mesmo arquivo não duplica os dados.</p>
        <button type="button" className="proto-subtle" disabled={busy} onClick={() => void importBackup()}>{busy ? <LoaderCircle className="food-spin" size={15} /> : <Upload size={15} />}{busy ? "Importando…" : "Restaurar backup"}</button>
      </article>
    </div>
    <div className="food-backup-footer">
      <span>Último backup: <strong>{formatDate(lastBackupAt)}</strong></span>
      <button type="button" className="food-backup-danger" disabled={busy} onClick={() => void createNewDatabase()}><Database size={14} />Criar banco novo</button>
    </div>
    <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void file.text().then(importContent); }} />
    {notice && <p className="food-backup-notice"><CheckCircle2 size={16} />{notice}</p>}
    {error && <p className="food-backup-error"><RefreshCw size={16} />{error}</p>}
  </section>;
}
