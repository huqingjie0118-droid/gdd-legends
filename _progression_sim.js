// Progression simulation — mirrors exact formulas from index.html
const BAL = {
  EXP_BASE: 150, EXP_GROWTH: 1.32,
  PLAYER_SCALE: 0.08,
  MON_LEVEL_SCALE: 0.045, MON_LEVEL_FLOOR: 0.75, MON_LEVEL_CAP: 2.2,
  REWARD_SCALE: 7, ELITE_XP: 2.2,
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Monster base exp (from MONSTER_DEFS)
const MON = {
  slime: { exp: 10, hp: 80, atk: 10, def: 3 },
  goblin: { exp: 20, hp: 150, atk: 18, def: 7 },
  skeleton: { exp: 35, hp: 260, atk: 28, def: 12 },
  orc: { exp: 55, hp: 460, atk: 42, def: 22 },
  darkmage: { exp: 65, hp: 360, atk: 58, def: 9 },
  tiger: { exp: 80, hp: 640, atk: 52, def: 28 }, // strongest normal
};

function monScale(lv) { return clamp(BAL.MON_LEVEL_FLOOR + (lv - 1) * BAL.MON_LEVEL_SCALE, BAL.MON_LEVEL_FLOOR, BAL.MON_LEVEL_CAP); }
function monExp(id, lv) { return Math.round(MON[id].exp * BAL.REWARD_SCALE * monScale(lv)); }
function expToNext(lv) { return Math.round(BAL.EXP_BASE * Math.pow(BAL.EXP_GROWTH, lv - 1)); }
function playerAtk(lv) { return Math.round(45 * (1 + (lv - 1) * BAL.PLAYER_SCALE)); }

// Time model: realistic combat = walk + attack. Assume ~3.2s per kill avg
// (move to target ~1.5s + ~4 hits @1/s + overkill/travel). Bosses excluded.
const SEC_PER_KILL = 3.2;

console.log('=== LV PROGRESSION WALL ANALYSIS (Warrior) ===');
console.log('Lv | ExpToNext | skelExp | kills(skel) | tigerExp | kills(tiger) | cumTime(min)');
let cumKills = 0, cumTime = 0;
for (let lv = 1; lv <= 22; lv++) {
  const need = expToNext(lv);
  const sk = monExp('skeleton', lv);
  const tg = monExp('tiger', lv);
  const skKills = Math.ceil(need / sk);
  const tgKills = Math.ceil(need / tg);
  cumKills += tgKills;
  cumTime += tgKills * SEC_PER_KILL;
  console.log(
    `${String(lv).padStart(2)} | ${String(need).padStart(8)} | ${String(sk).padStart(7)} | ${String(skKills).padStart(11)} | ${String(tg).padStart(8)} | ${String(tgKills).padStart(12)} | ${(cumTime/60).toFixed(1).padStart(11)}`
  );
}
console.log(`\nTOTAL kills (tiger-based) Lv1→22: ${cumKills}`);
console.log(`TOTAL time (tiger-based, @${SEC_PER_KILL}s/kill): ${(cumTime/60).toFixed(1)} min = ${(cumTime/3600).toFixed(2)} hr`);
console.log(`Player atk: Lv1=${playerAtk(1)} Lv10=${playerAtk(10)} Lv22=${playerAtk(22)}`);
console.log(`monScale: Lv1=${monScale(1)} Lv11=${monScale(11)} Lv22=${monScale(22)}`);

// Where does it "feel stuck"? When kills/level exceeds a threshold
console.log('\n=== "STUCK" ONSET (kills per single level) ===');
for (let lv = 1; lv <= 22; lv++) {
  const tgKills = Math.ceil(expToNext(lv) / monExp('tiger', lv));
  if (tgKills >= 5) console.log(`Lv${lv}: ${tgKills} tiger-kills for ONE level  (exp need ${expToNext(lv)})`);
}
