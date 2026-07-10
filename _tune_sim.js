// Tuner: find balanced exp config so Lv1->22 stays smooth (no single level >~12 kills of mixed monsters)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MON = { slime:{exp:10}, goblin:{exp:20}, skeleton:{exp:35}, orc:{exp:55}, darkmage:{exp:65}, tiger:{exp:80} };

function run(cfg, label) {
  const monScale = lv => clamp(cfg.MON_LEVEL_FLOOR + (lv-1)*cfg.MON_LEVEL_SCALE, cfg.MON_LEVEL_FLOOR, cfg.MON_LEVEL_CAP);
  const monExp = (id, lv) => Math.round(MON[id].exp * cfg.REWARD_SCALE * monScale(lv));
  const expToNext = lv => Math.round(cfg.EXP_BASE * Math.pow(cfg.EXP_GROWTH, lv-1));
  // realistic mixed-kill average weight: slime.2 goblin.2 skeleton.3 orc.15 darkmage.1 tiger.05
  let maxKills = 0, maxLv = 0, cum = 0;
  const rows = [];
  for (let lv=1; lv<=22; lv++) {
    const need = expToNext(lv);
    const avg = (monExp('slime',lv)*0.2 + monExp('goblin',lv)*0.2 + monExp('skeleton',lv)*0.3 + monExp('orc',lv)*0.15 + monExp('darkmage',lv)*0.1 + monExp('tiger',lv)*0.05);
    const kills = Math.ceil(need / avg);
    if (kills > maxKills) { maxKills = kills; maxLv = lv; }
    cum += kills;
    rows.push(kills);
  }
  console.log(`\n[${label}] EXP_GROWTH=${cfg.EXP_GROWTH} REWARD_SCALE=${cfg.REWARD_SCALE} MON_CAP=${cfg.MON_LEVEL_CAP} MON_SCALE=${cfg.MON_LEVEL_SCALE}`);
  console.log(`  kills/level: ${rows.join(' ')}`);
  console.log(`  max kills in ONE level: ${maxKills} @ Lv${maxLv} | total kills Lv1->22: ${cum} (~${(cum*3.2/60).toFixed(1)} min @3.2s/kill)`);
  return {maxKills, cum};
}

// Current (broken)
run({EXP_BASE:150, EXP_GROWTH:1.32, REWARD_SCALE:7, MON_LEVEL_FLOOR:0.75, MON_LEVEL_SCALE:0.045, MON_LEVEL_CAP:2.2}, 'CURRENT');

// Candidate A: gentler growth + higher reward + higher mon cap
run({EXP_BASE:150, EXP_GROWTH:1.16, REWARD_SCALE:11, MON_LEVEL_FLOOR:0.85, MON_LEVEL_SCALE:0.07, MON_LEVEL_CAP:3.2}, 'A');

// Candidate B: even gentler, stronger mon scaling
run({EXP_BASE:150, EXP_GROWTH:1.14, REWARD_SCALE:13, MON_LEVEL_FLOOR:0.9, MON_LEVEL_SCALE:0.08, MON_LEVEL_CAP:3.6}, 'B');

// Candidate C: flat-ish growth (classic ARPG feel)
run({EXP_BASE:150, EXP_GROWTH:1.12, REWARD_SCALE:14, MON_LEVEL_FLOOR:0.95, MON_LEVEL_SCALE:0.085, MON_LEVEL_CAP:4.0}, 'C');
