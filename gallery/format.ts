// Pure display helpers for the gallery client. Kept out of the DOM so they can be
// unit tested.

// Best-effort friendly names for the 12 battle-animation sections, by the GBAFE
// animation mode convention. The GIF itself is the ground truth; these are hints,
// and the trailing few are left generic.
export const SECTION_LABELS: string[] = [
  "Melee attack",
  "Melee attack (behind)",
  "Melee critical",
  "Melee critical (behind)",
  "Ranged attack",
  "Ranged critical",
  "Dodge (armed)",
  "Dodge (unarmed)",
  "Section 8",
  "Section 9",
  "Section 10",
  "Section 11",
];

export function sectionLabel(n: number): string {
  return SECTION_LABELS[n] ?? `Section ${n}`;
}

export function idTag(id: number): string {
  return `[${id}]`;
}

// GBAFE stores a weapon rank as a number; these thresholds map it to the usual
// letter. 0 (or less) means the rank is unusable, shown as a dash.
export function weaponRankLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n >= 251) return "S";
  if (n >= 181) return "A";
  if (n >= 121) return "B";
  if (n >= 71) return "C";
  if (n >= 31) return "D";
  return "E";
}

// Tooltip text for a table cell: always the column name and value, plus a decoded
// reading for the columns we know how to decode (the weapon rank columns, whose
// name ends in "Rank"). Other coded columns are left as the raw value on purpose,
// rather than guessing a meaning.
export function cellTitle(column: string, value: unknown): string {
  const base = `${column}: ${value}`;
  if (/Rank$/.test(column)) {
    const n = Number(value);
    if (Number.isFinite(n)) return `${base} (${weaponRankLabel(n)})`;
  }
  return base;
}
