# Map sprite credits

The FE8 (Fire Emblem: The Sacred Stones) unit map sprites in this folder are the original
Intelligent Systems standing sprites (files credited `{IS}`), taken from the community
graphics repository at https://github.com/Klokinator/FE-Repo (folder `Map Sprites/`),
maintained by Klokinator and the FEUniverse community. Fire Emblem art is the property of
Nintendo / Intelligent Systems. The sprites are not committed to this repository; only this
note is.

Each file is a standing (idle) sheet: 16 or 32 px wide, three frames stacked vertically,
on a `#80a080` background. `data/mapsprites.json` maps each class id to its file. The
team palettes in that file (blue player, red enemy) are FE8's own unit map palettes, read
from the ROM at offset 0x59EE20 (blue) and 0x59EE40 (red).

To restore the sprites, save each source file below as the local name shown.

| Local file | Source path under `Map Sprites/` |
|---|---|
| `lord.png` | Lords - Vanilla and Custom/Lord (F) Eirika Sword {IS}-stand.png |
| `great-lord.png` | Lords - Vanilla and Custom/Great Lord (F) Eirika Sword {IS}-stand.png |
| `cavalier.png` | Mounted - Cavs, Paladins, Rangers/Cavalier (M) Lance {IS}-stand.png |
| `paladin.png` | Mounted - Cavs, Paladins, Rangers/Paladin (M) Lance {IS}-stand.png |
| `knight.png` | Infantry - Knights, Generals, Armors/Knight (U) Lance {IS}-stand.png |
| `general.png` | Infantry - Knights, Generals, Armors/General (U) Lance {IS}-stand.png |
| `thief.png` | Infantry - (Swd) Thieves, Rogues, Assassins/Thief (M) {IS}-stand.png |
| `manakete.png` | Monsters - Dragons and Special/Manakete (F) Myrrh {IS}-stand.png |
| `mercenary.png` | Infantry - (Swd) Mercenaries and Heroes/Mercenary (M) {IS}-stand.png |
| `hero.png` | Infantry - (Swd) Mercenaries and Heroes/Hero (M) {IS}-stand.png |
| `myrmidon.png` | Infantry - (Swd) Myrms and Swordmasters/Myrmidon (M) Sword {IS}-stand.png |
| `swordmaster.png` | Infantry - (Swd) Myrms and Swordmasters/Swordmaster (M) {IS}-stand.png |
| `assassin.png` | Infantry - (Swd) Thieves, Rogues, Assassins/Assassin (M) {IS}-stand.png |
| `archer.png` | Infantry - (Bow) Archers and Hunters/Archer (M) {IS}-stand.png |
| `sniper.png` | Infantry - (Bow) Snipers and Ballistae/Sniper (M) {IS}-stand.png |
| `ranger.png` | Mounted - Cavs, Paladins, Rangers/Ranger (M) {IS}-stand.png |
| `wyvern-rider.png` | Mounted - Pegs, Wyverns, Griffons/Wyvern Rider (U) Lance {IS}-stand.png |
| `wyvern-lord.png` | Mounted - Pegs, Wyverns, Griffons/Wyvern Lord (U) Lance Male {IS}-stand.png |
| `wyvern-kn.png` | Mounted - Pegs, Wyverns, Griffons/Wyvern Knight (U) Lance {IS}-stand.png |
| `mage.png` | Magi - Nature-Type/Mage (M) {IS}-stand.png |
| `sage.png` | Magi - Nature-Type/Sage (M) {IS}-stand.png |
| `mage-knight.png` | Mounted - Valks, MKs, Magi/Mage Knight (M) {IS}-stand.png |
| `bishop.png` | Magi - Holy-Type/Bishop (M) {IS}-stand.png |
| `shaman.png` | Magi - Dark-Type/Shaman (M) {IS}-stand.png |
| `druid.png` | Magi - Dark-Type/Druid (M) {IS}-stand.png |
| `summoner.png` | Magi - Dark-Type/Summoner (M) {IS}-stand.png |
| `rogue.png` | Infantry - (Swd) Thieves, Rogues, Assassins/Rogue (M) {IS}-stand.png |
| `gorgon-egg.png` | Monsters - Basic Types/Gorgon Egg (U) White {IS}-stand.png |
| `great-knight.png` | Mounted - Cavs, Paladins, Rangers/Great Knight (M) Axe {IS}-stand.png |
| `recruit.png` | Infantry - (Lnc) Soldiers, Halberdiers/Recruit (F) Amelia Lance {IS}-stand.png |
| `journeyman.png` | Infantry - (Axe) Fighters and Warriors/Journeyman (M) Axe {IS}-stand.png |
| `pupil.png` | Magi - Nature-Type/Pupil (M) {IS}-stand.png |
| `fighter.png` | Infantry - (Axe) Fighters and Warriors/Fighter (M) Axe {IS}-stand.png |
| `warrior.png` | Infantry - (Axe) Fighters and Warriors/Warrior (M) Axe {IS}-stand.png |
| `brigand.png` | Infantry - (Axe) Brigs, Pirates, Zerkers/Brigand (M) Axe {IS}-stand.png |
| `pirate.png` | Infantry - (Axe) Brigs, Pirates, Zerkers/Pirate (M) Axe {IS}-stand.png |
| `berserker.png` | Infantry - (Axe) Brigs, Pirates, Zerkers/Berserker (M) Axe {IS}-stand.png |
| `monk.png` | Magi - Holy-Type/Monk (M) {IS}-stand.png |
| `priest.png` | Magi - Holy-Type/Priest (M) Staff {IS}-stand.png |
| `bard.png` | Bards, Dancers, Suppliers, Misc/Bard (M) Nils {IS}-stand.png |
| `pegasus-kn.png` | Mounted - Pegs, Wyverns, Griffons/Pegasi (F) T1 Lance {IS}-stand.png |
| `falcoknight.png` | Mounted - Pegs, Wyverns, Griffons/Pegasi (F) T2 Lance {IS}-stand.png |
| `cleric.png` | Magi - Holy-Type/Cleric (F) Generic {IS}-stand.png |
| `troubadour.png` | Mounted - Valks, MKs, Magi/Troubadour (F) {IS}-stand.png |
| `valkyrie.png` | Mounted - Valks, MKs, Magi/Valkyrie (F) {IS}-stand.png |
| `dancer.png` | Bards, Dancers, Suppliers, Misc/Dancer (F) Ninian {IS}-stand.png |
| `soldier.png` | Infantry - (Lnc) Soldiers, Halberdiers/Soldier (M) Lance {IS}-stand.png |
| `necromancer.png` | Magi - Dark-Type/Necromancer (M) Lyon {IS}-stand.png |
| `fleet.png` | Bards, Dancers, Suppliers, Misc/Boat (U) {IS}-stand.png |
| `phantom.png` | Monsters - Basic Types/Phantom (U) {IS}-stand.png |
| `revenant.png` | Monsters - Basic Types/Zombie (U) {IS}-stand.png |
| `entombed.png` | Monsters - Basic Types/Zombie (U) Entombed {IS}-stand.png |
| `bonewalker.png` | Monsters - Basic Types/Bonewalker (U) Sword {IS}-stand.png |
| `wight.png` | Monsters - Basic Types/Bonewalker (U) Wight Sword {IS}-stand.png |
| `bael.png` | Monsters - Basic Types/Bael (U) {IS}-stand.png |
| `elder-bael.png` | Monsters - Basic Types/Bael (U) Elder {IS}-stand.png |
| `cyclops.png` | Monsters - Basic Types/Cyclops (U) Axe {IS}-stand.png |
| `mauthe-doog.png` | Monsters - Basic Types/Wolf (U) {IS}-stand.png |
| `gwyllgi.png` | Monsters - Basic Types/Wolf (U) Gwyllgi {IS}-stand.png |
| `tarvos.png` | Monsters - Basic Types/Tarvos (M) Axe {IS}-stand.png |
| `maelduin.png` | Monsters - Basic Types/Tarvos (M) Maelduin Axe {IS}-stand.png |
| `mogall.png` | Monsters - Basic Types/Mogall (U) {IS}-stand.png |
| `arch-mogall.png` | Monsters - Basic Types/Mogall (U) Arch Mogall {IS}-stand.png |
| `gorgon.png` | Monsters - Basic Types/Gorgon (U) {IS}-stand.png |
| `gargoyle.png` | Monsters - Basic Types/Goyle (U) T1 Lance {IS}-stand.png |
| `deathgoyle.png` | Monsters - Basic Types/Goyle (U) T2 Lance {IS}-stand.png |
| `draco-zombie.png` | Monsters - Dragons and Special/Dracozombie (U) {IS}-stand.png |
| `demon-king.png` | Monsters - Dragons and Special/Demon King (U) Stationary {IS}-stand.png |
| `civilian.png` | Bards, Dancers, Suppliers, Misc/Villager (M) (Man) {IS}-stand.png |
| `queen.png` | Bards, Dancers, Suppliers, Misc/Queen (F) {IS}-stand.png |
| `pontifex.png` | Bards, Dancers, Suppliers, Misc/Pontifex (M) {IS}-stand.png |
| `infantry.png` | Infantry - (Axe) Fighters and Warriors/Fighter (M) Axe {IS}-stand.png |
| `flier.png` | Mounted - Pegs, Wyverns, Griffons/Pegasi (F) T1 Lance {IS}-stand.png |
| `mage_class.png` | Magi - Nature-Type/Mage (M) {IS}-stand.png |
