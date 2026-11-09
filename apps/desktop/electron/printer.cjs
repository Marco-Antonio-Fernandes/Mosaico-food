const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { app } = require("electron");

const execFileAsync = promisify(execFile);
const DEFAULT_PRINTER_NAME = process.env.MOSAICO_PRINTER_NAME || "elgin-i8";
const SETTINGS_FILE_NAME = "printer-settings.json";
const PAPER_WIDTH = 48;

function settingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE_NAME);
}

function defaultSettings() {
  return {
    enabled: true,
    autoPrint: true,
    printerName: DEFAULT_PRINTER_NAME,
    paperWidth: PAPER_WIDTH,
  };
}

function readSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return {
      ...defaultSettings(),
      ...(value && typeof value === "object" ? value : {}),
    };
  } catch {
    return defaultSettings();
  }
}

function normalizeSettings(input) {
  const current = readSettings();
  const next = input && typeof input === "object" ? input : {};
  const printerName = next.printerName === null || next.printerName === ""
    ? null
    : typeof next.printerName === "string" && /^[a-zA-Z0-9._-]+$/.test(next.printerName)
      ? next.printerName
      : current.printerName;

  return {
    enabled: typeof next.enabled === "boolean" ? next.enabled : current.enabled,
    autoPrint: typeof next.autoPrint === "boolean" ? next.autoPrint : current.autoPrint,
    printerName,
    paperWidth: PAPER_WIDTH,
  };
}

function saveSettings(input) {
  const settings = normalizeSettings(input);
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return getPrinterSettings();
}

async function runCommand(command, args) {
  try {
    const result = await execFileAsync(command, args, { encoding: "utf8", maxBuffer: 1024 * 1024 });
    return { stdout: result.stdout || "", stderr: result.stderr || "" };
  } catch (error) {
    const detail = [error?.message, error?.stderr].filter(Boolean).join(" ").trim();
    throw new Error(detail || `Não foi possível executar ${command}.`);
  }
}

async function listPrinters() {
  try {
    const [queues, devices] = await Promise.all([
      runCommand("lpstat", ["-e"]),
      runCommand("lpstat", ["-v"]),
    ]);
    const deviceByName = new Map();
    for (const line of devices.stdout.split(/\r?\n/)) {
      const match = line.match(/^device for (\S+):\s*(.+)$/);
      if (match) deviceByName.set(match[1], match[2]);
    }
    return queues.stdout
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean)
      .map(name => ({ name, deviceUri: deviceByName.get(name) || null }));
  } catch {
    return [];
  }
}

async function getPrinterState(printerName) {
  if (!printerName) return { state: "not-configured", message: "Nenhuma impressora selecionada." };
  try {
    const result = await runCommand("lpstat", ["-p", printerName]);
    const line = result.stdout.split(/\r?\n/).find(value => value.trim());
    const disabled = /disabled/i.test(result.stdout);
    return {
      state: disabled ? "disabled" : "idle",
      message: line?.trim() || "Fila disponível.",
    };
  } catch (error) {
    return { state: "unavailable", message: error instanceof Error ? error.message : "Fila indisponível." };
  }
}

async function getPrinterSettings() {
  const settings = readSettings();
  const printers = await listPrinters();
  const printerAvailable = Boolean(settings.printerName && printers.some(printer => printer.name === settings.printerName));
  const status = await getPrinterState(printerAvailable ? settings.printerName : null);
  return {
    ...settings,
    printers,
    printerAvailable,
    printerState: status.state,
    printerMessage: status.message,
  };
}

function sanitizePrinterText(value) {
  return String(value ?? "")
    .replace(/[×✕]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, "-")
    .replace(/\u00a0/g, " ");
}

function printerBuffer(lines) {
  const text = sanitizePrinterText(lines.join("\n")) + "\n";
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]), // ESC @: reset
    Buffer.from([0x1b, 0x74, 0x10]), // Windows-1252, suitable for Portuguese accents
    Buffer.from(text, "latin1"),
    Buffer.from([0x0a, 0x0a, 0x0a]),
    Buffer.from([0x1d, 0x56, 0x00]), // full cut, if supported by the model
  ]);
}

function repeat(character, width) {
  return character.repeat(Math.max(1, width));
}

function fit(value, width) {
  const text = sanitizePrinterText(value);
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 3))}...`;
}

function columns(left, right, width = PAPER_WIDTH) {
  const rightText = sanitizePrinterText(right);
  const leftWidth = Math.max(1, width - rightText.length - 1);
  return `${fit(left, leftWidth).padEnd(leftWidth, " ")} ${rightText}`;
}

function wrap(value, width = PAPER_WIDTH) {
  const text = sanitizePrinterText(value).trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.flatMap(line => {
    if (line.length <= width) return [line];
    const chunks = [];
    for (let index = 0; index < line.length; index += width) chunks.push(line.slice(index, index + width));
    return chunks;
  });
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value || Date.now()));
}

function labelForSource(source) {
  return ({ whatsapp: "WhatsApp", balcao: "Balcao", assistant: "Assistente", scheduled: "Agendamento", manual: "Balcao" })[source] || source || "Balcao";
}

function labelForStatus(status) {
  return ({ pending: "Pendente", confirmed: "Confirmado", preparing: "Em preparo", ready: "Pronto", completed: "Concluido", cancelled: "Cancelado", paid: "Pago", unpaid: "Pendente" })[status] || status || "Pendente";
}

function labelForPayment(paymentMethod) {
  return ({ cash: "Dinheiro", debit: "Debito", credit: "Credito", card_debit: "Debito", card_credit: "Credito", pix: "Pix", meal_voucher: "Vale-refeicao", food_voucher: "Vale-alimentacao", crediario: "Crediario" })[paymentMethod] || paymentMethod || "Nao informado";
}

function formatOrderReceipt(order) {
  const width = PAPER_WIDTH;
  const orderNumber = String(order.id || "").slice(-8).toUpperCase();
  const lines = [
    "\x1b\x61\x01\x1b\x45\x01\x1b\x1d\x21\x11MOSAICO FOOD\x1b\x1d\x21\x00\x1b\x45\x00\x1b\x61\x00",
    "COMANDA DE PRODUCAO",
    `PEDIDO #${orderNumber}`,
    dateTime(order.createdAt),
    "",
    `ORIGEM: ${labelForSource(order.source)}`,
    `STATUS: ${labelForStatus(order.status)}`,
    `CLIENTE: ${order.customerName || order.customer?.name || "Consumidor final"}`,
  ];
  if (order.customer?.phone) lines.push(`TELEFONE: ${order.customer.phone}`);

  if (order.fulfillment === "delivery") {
    lines.push("MODALIDADE: ENTREGA");
    if (order.deliveryAddress) lines.push(...wrap(`ENDERECO: ${order.deliveryAddress}`, width));
  } else {
    lines.push("MODALIDADE: RETIRADA");
  }

  lines.push(repeat("-", width), "ITENS");
  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    const quantity = Number(item.quantity || 0);
    const productName = item.productName || "Item sem nome";
    const variant = item.variantName ? ` - ${item.variantName}` : "";
    lines.push(...wrap(`${quantity}x ${productName}${variant}`, width));
    if (item.unitPriceCents !== undefined) lines.push(columns("  UNITARIO", money(item.unitPriceCents)));
    lines.push(columns("", money(item.totalCents)));
    if (item.fryNow) lines.push("  * PREPARAR AGORA");
    if (item.isGift) lines.push("  * CORTESIA");
    if (Number(item.adjustmentCents || 0) !== 0) lines.push(columns("  AJUSTE VALOR", money(item.adjustmentCents)));
    if (item.adjustmentNote) lines.push(...wrap(`  AJUSTE: ${item.adjustmentNote}`, width));
  }
  if (!items.length) lines.push("Nenhum item informado.");

  lines.push(repeat("-", width));
  lines.push(columns("TOTAL", money(order.totalCents)));
  lines.push(`PAGAMENTO: ${labelForPayment(order.paymentMethod)}`);
  if (order.paymentMethod === "cash" && Number(order.cashReceivedCents || 0) > 0) {
    lines.push(columns("DINHEIRO ENTREGUE", money(order.cashReceivedCents)));
    lines.push(columns("TROCO", money(order.cashChangeCents || 0)));
  }
  if (order.paymentStatus) lines.push(`STATUS PAGAMENTO: ${labelForStatus(order.paymentStatus)}`);
  lines.push(`CONTROLE: ${String(order.id || "").slice(0, 16)}`);
  lines.push(repeat("-", width), "CONFERIR ITENS E OBSERVACOES", "NAO E DOCUMENTO FISCAL");
  return printerBuffer(lines);
}

async function printRaw(printerName, data, title) {
  if (!printerName || !/^[a-zA-Z0-9._-]+$/.test(printerName)) throw new Error("Fila de impressora inválida.");
  return new Promise((resolve, reject) => {
    const child = require("node:child_process").spawn("lp", ["-d", printerName, "-o", "raw", "-t", title || "Mosaico Food"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => reject(error));
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error((stderr || stdout || `A fila recusou o trabalho (código ${code}).`).trim()));
        return;
      }
      const jobId = stdout.match(/request id is\s+([^\s]+)/i)?.[1] || null;
      resolve({ jobId, printerName });
    });
    child.stdin.end(data);
  });
}

async function printFoodOrder(order) {
  if (!order || typeof order !== "object" || !order.id) throw new Error("Pedido inválido para impressão.");
  const settings = readSettings();
  if (!settings.printerName) throw new Error("Nenhuma impressora configurada.");
  return printRaw(settings.printerName, formatOrderReceipt(order), `Mosaico Food - Pedido ${String(order.id).slice(-8)}`);
}

async function printTestOrder() {
  const settings = readSettings();
  if (!settings.printerName) throw new Error("Nenhuma impressora configurada.");
  const lines = [
    "\x1b\x61\x01\x1b\x45\x01MOSAICO FOOD\x1b\x45\x00",
    "TESTE DE IMPRESSAO",
    dateTime(new Date().toISOString()),
    repeat("-", PAPER_WIDTH),
    "Elgin i8 / Bematech",
    "Fila: " + settings.printerName,
    "Acentos: acao, cafe, pao, informacao",
    repeat("-", PAPER_WIDTH),
    "Impressora pronta para pedidos.",
    "",
    "NAO E DOCUMENTO FISCAL",
  ];
  return printRaw(settings.printerName, printerBuffer(lines), "Mosaico Food - Teste");
}

module.exports = {
  getPrinterSettings,
  printFoodOrder,
  printTestOrder,
  savePrinterSettings: saveSettings,
};
