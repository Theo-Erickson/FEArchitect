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
