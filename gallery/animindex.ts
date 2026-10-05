// Build a map from battle-animation id to the class that uses it, by reading each
// class's animation mode list out of the ROM.
//
// A GBA ROM is mapped at 0x08000000, so a class pointer P lives at file offset
// P - 0x08000000. Each class's BattleAnimePointer points at a list of 4-byte
// entries: [mode, flag, animIdLo, animIdHi]. A flag byte of 1 marks a real entry;
// any other flag byte (0 in practice) ends the list. Each animation id belongs to
// exactly one class, so the map is id -> { class name, the modes that use it }.

const ROM_BASE = 0x08000000;
const MAX_ENTRIES = 16;   // safety cap so a malformed list cannot loop forever
const MAX_ANIM_ID = 2000; // a sane upper bound; a larger value means we lost sync

type ClassRow = { id?: number; name?: unknown; BattleAnimePointer?: unknown };
export type AnimEntry = { cls: string; modes: number[] };

function cleanName(name: unknown): string {
  // Extracted text sometimes carries trailing control characters; drop them.
  return String(name ?? "").replace(/[\u0000-\u001f]/g, "").trim();
}

export function animIndex(rom: Uint8Array, classes: ClassRow[]): Record<number, AnimEntry> {
  const map: Record<number, AnimEntry> = {};
  for (const c of classes) {
    const ptr = typeof c.BattleAnimePointer === "string" ? parseInt(c.BattleAnimePointer, 16) : 0;
    if (!ptr) continue;
    let o = ptr - ROM_BASE;
    if (o < 0 || o + 4 > rom.length) continue;
    const cls = cleanName(c.name);
    for (let n = 0; n < MAX_ENTRIES; n++) {
      if (o + 4 > rom.length) break;
      const flag = rom[o + 1];
      if (flag !== 1) break; // end of this class's list
      const mode = rom[o];
      const animId = rom[o + 2] | (rom[o + 3] << 8);
      if (animId > MAX_ANIM_ID) break;
      const existing = map[animId];
      if (existing) {
        if (!existing.modes.includes(mode)) existing.modes.push(mode);
      } else {
        map[animId] = { cls, modes: [mode] };
      }
      o += 4;
    }
  }
  return map;
}
