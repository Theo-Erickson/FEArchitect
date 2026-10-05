// Normalize the CLI's raw export rows into clean records: parse hex-string
// numbers to integers, split the `Index` field ("0x00 Eirika") into id and name,
// and keep `*Pointer` fields as their raw hex string (the gallery does not follow
// them). One generic pass handles units, classes, and items.

const HEX = /^0x[0-9a-fA-F]+$/;

export function parseHex(v: string): number {
  return parseInt(v, 16);
}

export function normalizeRow(raw: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "Index") {
      const sp = value.indexOf(" ");
      const hex = sp < 0 ? value : value.slice(0, sp);
      out.id = parseInt(hex, 16);
      out.name = sp < 0 ? "" : value.slice(sp + 1).trim();
      continue;
    }
    if (typeof value === "string" && HEX.test(value)) {
      out[key] = key.endsWith("Pointer") ? value : parseHex(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Accepts the raw export as an array of rows or an object whose values are rows.
export function normalizeTable(raw: Record<string, string>[] | Record<string, Record<string, string>>): Record<string, any>[] {
  const rows = Array.isArray(raw) ? raw : Object.values(raw);
  return rows.map(normalizeRow);
}
