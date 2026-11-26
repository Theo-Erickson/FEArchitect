// Read FE8's terrain tables out of a ROM buffer. 65 terrain ids, every table 65 bytes
// (u8), at the documented FE8U addresses. Move cost 255 means impassable (null). The
// move-cost tables chosen map FE8's movement types down to the sim's three:
// foot = CommonT1, cav = HorseT2, fly = Fly (Normal weather). See
// docs/superpowers/notes/fe8-map-format.md and the terrain grid spec.
const ROM_BASE = 0x08000000;
export const TERRAIN_COUNT = 65;
const IMPASSABLE = 255;

// In-game style label per terrain id, indexed per the fireemblem8u decomp's enum
// (include/constants/terrains.h, TERRAIN_NONE = 0x00 .. TERRAIN_MAST = 0x40) and
// cross-checked against the ROM stats (12 Forest foot 2, 17 Mountain foot 4 / cav 6,
// 18 Peak impassable avoid 40, ...). Ids 0x2C and 0x2E have no known name and fall
// back to "Terrain N".
export const TERRAIN_NAMES: Readonly<Record<number, string>> = {
  0: "--", 1: "Plains", 2: "Road", 3: "Village", 4: "Village", 5: "House",
  6: "Armory", 7: "Vendor", 8: "Arena", 9: "C.Room", 10: "Fort", 11: "Gate",
  12: "Forest", 13: "Thicket", 14: "Sand", 15: "Desert", 16: "River",
  17: "Mountain", 18: "Peak", 19: "Bridge", 20: "Bridge", 21: "Sea", 22: "Lake",
  23: "Floor", 24: "Floor", 25: "Fence", 26: "Wall", 27: "Wall", 28: "Rubble",
  29: "Pillar", 30: "Door", 31: "Throne", 32: "Chest", 33: "Chest", 34: "Roof",
  35: "Gate", 36: "Church", 37: "Ruins", 38: "Cliff", 39: "Ballista",
  40: "Longbow", 41: "Killerbow", 42: "Ship", 43: "Ship", 45: "Stairs",
  47: "Glacier", 48: "Arena", 49: "Valley", 50: "Fence", 51: "Snag",
  52: "Bridge", 53: "Sky", 54: "Deeps", 55: "Ruins", 56: "Inn", 57: "Barrel",
  58: "Bone", 59: "Dark", 60: "Water", 61: "Gunnels", 62: "Deck", 63: "Brace",
  64: "Mast",
};

export const terrainName = (id: number): string => TERRAIN_NAMES[id] ?? `Terrain ${id}`;

const A = {
  footCost: 0x0880b849, cavCost: 0x0880bad3, flyCost: 0x0880bb96,
  avo: 0x0880c479, avoFly: 0x0880c53c, def: 0x0880c4ba, defFly: 0x0880c57d,
  res: 0x0880c4fb, resFly: 0x0880c5be, heal: 0x0880c744, healS: 0x0880c785,
  nameId: 0x0880d374,
};

export type TerrainRaw = {
  id: number; nameTextId: number;
  avoid: number; def: number; res: number;
  flyAvoid: number; flyDef: number; flyRes: number;
  heal: number; healsStatus: boolean;
  moveCost: { foot: number | null; cav: number | null; fly: number | null };
};

export function extractTerrain(rom: Uint8Array): TerrainRaw[] {
  const dv = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  const u8 = (addr: number, i: number) => rom[addr - ROM_BASE + i];
  const cost = (addr: number, i: number) => { const v = u8(addr, i); return v === IMPASSABLE ? null : v; };
  const out: TerrainRaw[] = [];
  for (let i = 0; i < TERRAIN_COUNT; i++) {
    out.push({
      id: i,
      nameTextId: dv.getUint16(A.nameId - ROM_BASE + i * 2, true),
      avoid: u8(A.avo, i), def: u8(A.def, i), res: u8(A.res, i),
      flyAvoid: u8(A.avoFly, i), flyDef: u8(A.defFly, i), flyRes: u8(A.resFly, i),
      heal: u8(A.heal, i), healsStatus: u8(A.healS, i) !== 0,
      moveCost: { foot: cost(A.footCost, i), cav: cost(A.cavCost, i), fly: cost(A.flyCost, i) },
    });
  }
  return out;
}
