import { useEffect, useState } from "react";
import { Panel } from "@/components/shared/prototype-kit";

type PrinterSettings = Awaited<ReturnType<NonNullable<Window["mosaicoDesktop"]>["getPrinterSettings"]>>;

export function FoodPrinterPanel() {
  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [printerName, setPrinterName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [autoPrint, setAutoPrint] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const bridge = window.mosaicoDesktop;
      if (!bridge?.getPrinterSettings) throw new Error("A impressão local está disponível apenas no aplicativo instalado.");
      const next = await bridge.getPrinterSettings();
      setSettings(next);
      setPrinterName(next.printerName || next.printers[0]?.name || "");
      setEnabled(next.enabled);
      setAutoPrint(next.autoPrint);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar as impressoras.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    const bridge = window.mosaicoDesktop;
    if (!bridge?.savePrinterSettings) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await bridge.savePrinterSettings({ enabled, autoPrint, printerName: printerName || null });
      setSettings(next);
      window.dispatchEvent(new CustomEvent("food-printer-settings-changed"));
      setNotice("Configuração da impressão salva.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a configuração.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    const bridge = window.mosaicoDesktop;
    if (!bridge?.testPrinter) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await bridge.savePrinterSettings({ enabled, autoPrint, printerName: printerName || null });
      setSettings(next);
      window.dispatchEvent(new CustomEvent("food-printer-settings-changed"));
      await bridge.testPrinter();
      setNotice("Teste enviado para a impressora.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível testar a impressora.");
    } finally {
      setBusy(false);
    }
  };

  return <Panel title="Impressão de pedidos" subtitle="Elgin i8 · comanda de produção para a cozinha">
    {loading ? <p className="proto-caption">Consultando filas de impressão…</p> : <>
      <div className="proto-form">
        <label>Fila da impressora
          <select value={printerName} onChange={event => setPrinterName(event.target.value)}>
            <option value="">Selecione uma fila</option>
            {(settings?.printers || []).map(printer => <option key={printer.name} value={printer.name}>{printer.name}</option>)}
          </select>
        </label>
        <label className="proto-switch"><span>Impressora ativa</span><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /></label>
        <label className="proto-switch"><span>Imprimir pedidos novos automaticamente</span><input type="checkbox" checked={autoPrint} onChange={event => setAutoPrint(event.target.checked)} /></label>
      </div>
      <div className="proto-toolbar">
        <span role="status">{settings?.printerAvailable ? `Status: ${settings.printerState === "idle" ? "pronta" : settings.printerState}` : "Status: fila não encontrada"}</span>
        <button type="button" className="proto-subtle" onClick={() => void load()} disabled={busy}>Atualizar filas</button>
        <button type="button" className="proto-subtle" onClick={() => void test()} disabled={busy || !printerName}>Testar impressão</button>
        <button type="button" onClick={() => void save()} disabled={busy || !printerName}>{busy ? "Salvando…" : "Salvar configuração"}</button>
      </div>
      {settings?.printers.length === 0 && <p className="proto-caption">Nenhuma fila CUPS foi encontrada. Verifique a conexão USB da Elgin i8.</p>}
      {settings?.printerAvailable && <p className="proto-caption">Cada pedido novo do balcão ou do WhatsApp será enviado uma única vez para esta fila. O comprovante inclui itens, quantidades, ajustes, modalidade, endereço, pagamento e total.</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </>}
  </Panel>;
}
