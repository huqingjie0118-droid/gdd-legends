const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MON = { slime:{exp:10}, goblin:{exp:20}, skeleton:{exp:35}, orc:{exp:55}, darkmage:{exp:65}, tiger:{exp:80} };
function run(cfg, label) {
  const monScale = lv => clamp(cfg.MON_LEVEL_FLOOR + (lv-1)*cfg.MON_LEVEL_SCALE, cfg.MON_LEVEL_FLOOR, cfg.MON_LEVEL_CAP);
  const monExp = (id, lv) => Math.round(MON[id].exp * cfg.REWARD_SCALE * monScale(lv));
  const expToNext = lv => Math.round(cfg.EXP_BASE * Math.pow(cfg.EXP_GROWTH, lv-1));
  let maxKills = 0, maxLv = 0, cum = 0; const rows = [];
  for (let lv=1; lv<=22; lv++) {
    const need = expToNext(lv);
    const avg = (monExp('slime',lv)*0.2 + monExp('goblin',lv)*0.2 + monExp('skeleton',lv)*0.3 + monExp('orc',lv)*0.15 + monExp('darkmage',lv)*0.1 + monExp('tiger',lv)*0.05);
    const kills = Math.ceil(need / avg);
    if (kills > maxKills) { maxKills = kills; maxLv = lv; }
    cum += kills; rows.push(kills);
  }
  console.log(`[${label}] G=${cfg.EXP_GROWTH} RS=${cfg.REWARD_SCALE} CAP=${cfg.MON_LEVEL_CAP} MS=${cfg.MON_LEVEL_SCALE} FL=${cfg.MON_LEVEL_FLOOR}`);
  console.log(`  ${rows.join(' ')}`);
  console.log(`  max=${maxKills}@Lv${maxLv} total=${cum} (~${(cum*3.2/60).toFixed(1)}min)`);
}
run({EXP_BASE:150, EXP_GROWTH:1.22, REWARD_SCALE:8.5, MON_LEVEL_FLOOR:0.8, MON_LEVEL_SCALE:0.055, MON_LEVEL_CAP:2.7}, 'D');
run({EXP_BASE:150, EXP_GROWTH:1.24, REWARD_SCALE:8, MON_LEVEL_FLOOR:0.8, MON_LEVEL_SCALE:0.05, MON_LEVEL_CAP:2.6}, 'E');
run({EXP_BASE:150, EXP_GROWTH:1.20, REWARD_SCALE:9, MON_LEVEL_FLOOR:0.82, MON_LEVEL_SCALE:0.06, MON_LEVEL_CAP:2.8}, 'F');
run({EXP_BASE:150, EXP_GROWTH:1.21, REWARD_SCALE:8.5, MON_LEVEL_FLOOR:0.82, MON_LEVEL_SCALE:0.058, MON_LEVEL_CAP:2.75}, 'G');
