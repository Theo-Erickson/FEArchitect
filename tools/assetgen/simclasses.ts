// Convert an extracted FE8 class record into our sim class format. GBAFE has one Pow
// stat; route it to mag if the class has any magic weapon rank, else str. Movement
// type comes from the class move-cost table pointer. See the units/skills spec.
const clean = (s: string) => String(s).replace(/[\u0000-\u001f]/g, "").trim();

// FE8U move-cost table pointers.
export const FLY_MOVCOST = "0x0880BB96";
export const HORSE_T1 = "0x0880BA92";
export const HORSE_T2 = "0x0880BAD3";
export const HORSE_MOVCOST = [HORSE_T1, HORSE_T2];

function movementType(c: any): "foot" | "cav" | "fly" {
  const p = String(c.MovCostPointer ?? "").toUpperCase();
  if (p === FLY_MOVCOST.toUpperCase()) return "fly";
  if (HORSE_MOVCOST.map((h) => h.toUpperCase()).includes(p)) return "cav";
  return "foot";
}

function isMagicClass(c: any): boolean {
  return (c.AnimaRank || 0) > 0 || (c.LightRank || 0) > 0 || (c.DarkRank || 0) > 0 || (c.StaffRank || 0) > 0;
}

export function toSimClass(c: any): any {
  const magic = isMagicClass(c);
  const pow = (physical: number, magical: number) => (magic ? { str: 0, mag: magical } : { str: physical, mag: 0 });
  return {
    name: clean(c.name),
    movementType: movementType(c),
    move: c.BaseMov ?? 5,
    bases: { hp: c.BaseHP, ...pow(c.BasePow, c.BasePow), skl: c.BaseSkl, spd: c.BaseSpd, def: c.BaseDef, res: c.BaseRes, con: c.BaseCon },
    caps: { hp: c.MaxHP, ...pow(c.MaxPow, c.MaxPow), skl: c.MaxSkl, spd: c.MaxSpd, def: c.MaxDef, res: c.MaxRes, con: c.MaxCon },
    growths: { hp: c.GrowthHP, ...pow(c.GrowthPow, c.GrowthPow), skl: c.GrowthSkl, spd: c.GrowthSpd, def: c.GrowthDef, res: c.GrowthRes, lck: c.GrowthLck },
    skills: [],
  };
}
