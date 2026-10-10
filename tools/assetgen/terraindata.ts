// Read FE8's terrain tables out of a ROM buffer. 65 terrain ids, every table 65 bytes
// (u8), at the documented FE8U addresses. Move cost 255 means impassable (null). The
// move-cost tables chosen map FE8's movement types down to the sim's three:
// foot = CommonT1, cav = HorseT2, fly = Fly (Normal weather). See
// docs/superpowers/notes/fe8-map-format.md and the terrain grid spec.
const ROM_BASE = 0x08000000;
export const TERRAIN_COUNT = 65;
const IMPASSABLE = 255;

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
