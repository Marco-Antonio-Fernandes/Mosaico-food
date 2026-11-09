import { useEffect } from "react";
import { getFoodOrders } from "@/lib/food-api";

const PRINTED_ORDER_IDS_KEY = "mosaico-food-printed-order-ids-v1";
const MAX_PRINTED_ORDER_IDS = 1500;

function readPrintedOrderIds() {
  try {
    const value = JSON.parse(localStorage.getItem(PRINTED_ORDER_IDS_KEY) || "[]");
    return new Set<string>(Array.isArray(value) ? value.filter(item => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function savePrintedOrderIds(ids: Set<string>) {
  const values = [...ids].slice(-MAX_PRINTED_ORDER_IDS);
  localStorage.setItem(PRINTED_ORDER_IDS_KEY, JSON.stringify(values));
}

function dispatchPrinterStatus(detail: { state: string; orderId?: string; message?: string }) {
  window.dispatchEvent(new CustomEvent("food-printer-status", { detail }));
}

export function FoodPrinterAgent() {
  useEffect(() => {
    let disposed = false;
    let draining = false;
    const startedAt = Date.now();

    const drainPrinter = async () => {
      if (disposed || draining || !window.mosaicoDesktop?.getPrinterSettings) return;
      draining = true;
      try {
        const settings = await window.mosaicoDesktop.getPrinterSettings();
        if (disposed || !settings.printerAvailable) {
          dispatchPrinterStatus({ state: "unavailable", message: settings.printerMessage });
          return;
        }

        const orders = await getFoodOrders();
        if (disposed) return;

        let printedIds = readPrintedOrderIds();
        // A primeira leitura cadastra o histórico existente. Assim, instalar o
        // recurso não dispara uma fila de impressão de pedidos antigos. Pedidos
        // criados depois que o agente iniciou continuam sendo impressos.
        const hasHistory = localStorage.getItem(PRINTED_ORDER_IDS_KEY) !== null;
        if (!hasHistory) {
          printedIds = new Set(orders
            .filter(order => new Date(order.createdAt).getTime() <= startedAt)
            .map(order => order.id));
          savePrintedOrderIds(printedIds);
          dispatchPrinterStatus({ state: "ready" });
        }

        // Com a impressão desligada, acompanhe os pedidos sem criar uma fila
        // atrasada para quando a opção for ativada novamente.
        if (!settings.enabled || !settings.autoPrint) {
          orders.forEach(order => printedIds.add(order.id));
          savePrintedOrderIds(printedIds);
          dispatchPrinterStatus({ state: "disabled" });
          return;
        }

        const pending = orders
          .filter(order => !printedIds.has(order.id))
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

        for (const order of pending) {
          if (disposed) return;
          try {
            await window.mosaicoDesktop.printFoodOrder(order);
            printedIds.add(order.id);
            savePrintedOrderIds(printedIds);
            dispatchPrinterStatus({ state: "printed", orderId: order.id });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível enviar o pedido para a impressora.";
            console.error("[Mosaico Food] Falha ao imprimir pedido", order.id, error);
            dispatchPrinterStatus({ state: "error", orderId: order.id, message });
            // Preserve o pedido pendente para tentar novamente no próximo ciclo.
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível consultar os pedidos para impressão.";
        console.error("[Mosaico Food] Falha na fila de impressão", error);
        dispatchPrinterStatus({ state: "error", message });
      } finally {
        draining = false;
      }
    };

    void drainPrinter();
    const timer = window.setInterval(() => void drainPrinter(), 5_000);
    const onSettingsChanged = () => void drainPrinter();
    window.addEventListener("food-printer-settings-changed", onSettingsChanged);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("food-printer-settings-changed", onSettingsChanged);
    };
  }, []);

  return null;
}
