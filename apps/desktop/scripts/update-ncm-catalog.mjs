import { mkdir, writeFile } from "node:fs/promises";

const sourceUrl = "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";
const outputPath = new URL("../src/data/ncm-catalog.ts", import.meta.url);

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Não foi possível baixar a tabela NCM: HTTP ${response.status}`);
}

const source = await response.json();
const items = Array.isArray(source?.Nomenclaturas) ? source.Nomenclaturas : [];
const catalog = items
  .map((item) => ({
    code: String(item?.Codigo ?? "").replace(/\D/g, ""),
    description: String(item?.Descricao ?? "").replace(/^[\s-]+/, "").replace(/\s+/g, " ").trim(),
  }))
  .filter((item) => /^\d{8}$/.test(item.code) && item.description)
  .filter((item, index, list) => list.findIndex((candidate) => candidate.code === item.code) === index)
  .sort((a, b) => a.code.localeCompare(b.code));

if (catalog.length < 10000) {
  throw new Error(`A tabela baixada parece incompleta: apenas ${catalog.length} NCMs encontrados.`);
}

await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
const generated = `// Gerado por scripts/update-ncm-catalog.mjs a partir da tabela oficial do Siscomex.\n// Não edite manualmente; atualize com npm run update:ncm.\n\nexport type NcmOption = { code: string; description: string };\n\nexport const NCM_CATALOG: NcmOption[] = ${JSON.stringify(catalog, null, 2)};\n`;
await writeFile(outputPath, generated, "utf8");
console.log(`Catálogo NCM atualizado: ${catalog.length} códigos (${source.Data_Ultima_Atualizacao_NCM ?? "data não informada"}).`);
